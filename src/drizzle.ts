/**
 * This module provides a Drizzle ORM search utility that extends AdvancedSearchParser to parse advanced search queries into Drizzle-compatible filter objects.
 * @module
 *
 * @example
 * ```ts
 * import { DrizzleSearchParser } from "@sillvva/search/drizzle";
 *
 * // Example Drizzle schema and relations (pseudo-code)
 * import { relations } from "./schema";
 *
 * // Instantiate the parser
 * const parser = new DrizzleSearchParser<typeof relations, "user">((cond) => {
 *   if (cond.key === "name") {
 *     return { name: { ilike: `%${cond.value}%` } };
 *   }
 *   if (cond.key === "age") {
 *     const age = parseInt(cond.value);
 *     if (isNaN(age)) return undefined;
 *     return { age };
 *   }
 *   return undefined;
 * }, { validKeys: ["name", "age"] });
 *
 * // Parse a query string ✅
 * const { where } = parser.parseDrizzle("name:John AND age:30");
 * // where: { AND: [{ name: { ilike: "%John%" } }, { age: 30 }] }
 * 
 * // Usage
 * const users = await db.query.user.findMany({
 *   where
 * });
 * ```
 */

import type {
  ExtractTablesWithRelations,
  Relations,
  RelationsFilter
} from "drizzle-orm";
import {
  AdvancedSearchParser,
  Token,
  type ASTCondition,
  type ASTNode,
  type AdvancedSearchParserOptions
} from ".";

export class DrizzleSearchParser<
  TRelations extends Relations<any, any, any>,
  TableName extends keyof TRSchema,
  TRSchema extends ExtractTablesWithRelations<TRelations> = ExtractTablesWithRelations<TRelations>,
  TFilter extends RelationsFilter<
    TRSchema[TableName],
    TRSchema
  > = RelationsFilter<TRSchema[TableName], TRSchema>
> extends AdvancedSearchParser {
  constructor(
    private conditionBuilderFn: (ast: ASTCondition) => TFilter | undefined,
    options?: AdvancedSearchParserOptions
  ) {
    super(options);
  }

  // Build where clause object from Abstract Syntax Tree
  private buildWhereClause(
    ast: ASTNode | null,
    parentNegated = false
  ): TFilter | undefined {
    if (!ast) return;

    const isNegated = parentNegated || ast.negated === true;

    const buildClause = (node: ASTNode) => {
      switch (node.type) {
        case "binary":
          const leftClause = this.buildWhereClause(node.left, isNegated);
          const rightClause = this.buildWhereClause(node.right, isNegated);

          if (!leftClause || !rightClause) {
            if (leftClause) return leftClause;
            else if (rightClause) return rightClause;
            else return;
          }

          const result =
            node.operator === "AND"
              ? ({ AND: [leftClause, rightClause] } as unknown as TFilter)
              : ({ OR: [leftClause, rightClause] } as unknown as TFilter);

          return result;

        case "condition":
          return this.conditionBuilderFn({
            key: node.key,
            value: node.value,
            isRegex: node.token.includes("regex"),
            isNegated
          });
      }
    };

    const clause = buildClause(ast);

    if (
      clause &&
      ast.negated &&
      !(clause.NOT && Object.keys(clause).length === 1)
    ) {
      return { NOT: clause } as unknown as TFilter;
    }

    return clause;
  }

  parseDrizzle(query: string): {
    tokens: Token[];
    ast: ASTNode | null;
    astConditions: ASTCondition[];
    where: TFilter | undefined;
  } {
    const result = this.parse(query);
    const where = this.buildWhereClause(result.ast);
    return {
      ...result,
      where
    };
  }
}
