import type { ExtractTablesWithRelations, Relations, RelationsFilter } from "drizzle-orm";
import { NumericOperator, ParseError, QueryParser, QueryParserOptions, Token, type ASTCondition, type ASTNode } from "./index";

type DrizzleOperator = "eq" | "gt" | "lt" | "gte" | "lte";

const operatorMap = new Map<NumericOperator, DrizzleOperator>([
	["=", "eq"],
	[">", "gt"],
	["<", "lt"],
	[">=", "gte"],
	["<=", "lte"]
]);

/**
 * A parser for Drizzle ORM that extends `AdvancedSearchParser` to parse advanced search queries into Drizzle-compatible filter objects.
 * @typeParam TRelations - The relations of the Drizzle schema.
 * @typeParam TableName - The name of the table to search. See `AdvancedSearchParserOptions`
 *
 * @example
 * You can see a demo of this on [CodeSandbox](https://codesandbox.io/p/devbox/4894v5?file=%2Flib%2Fsearch%2Fcharacter.ts%3A63%2C9).
 *
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
 *     const op = parser.parseNumeric(cond);
 *     return op && { age: op };
 *   }
 *   return undefined;
 * }, { validKeys: ["name", "age"], defaultKey: "name" });
 *
 * // Parse a query string ✅
 * const { where } = parser.parseDrizzle("John age>=30");
 * // where: { AND: [{ name: { ilike: "%John%" } }, { age: { gte: 30 } }] }
 *
 * // Invalid age ❌
 * const { where } = parser.parseDrizzle("John age:thirty");
 * // where: { AND: [{ name: { ilike: "%John%" } }] }
 *
 * // Usage
 * const users = await db.query.user.findMany({
 *   where
 * });
 * ```
 */
export class DrizzleSearchParser<
	TRelations extends Relations<any, any, any>,
	TableName extends keyof TRSchema,
	TRSchema extends ExtractTablesWithRelations<TRelations> = ExtractTablesWithRelations<TRelations>,
	TFilter extends RelationsFilter<TRSchema[TableName], TRSchema> = RelationsFilter<TRSchema[TableName], TRSchema>
> extends QueryParser {
	constructor(private conditionBuilderFn: (ast: ASTCondition) => TFilter | undefined, options?: QueryParserOptions) {
		super(options);
	}

	// Build where clause object from Abstract Syntax Tree
	private buildWhereClause(ast: ASTNode | null, parentNegated = false): TFilter | undefined {
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

					const left = leftClause[node.operator];
					const right = rightClause[node.operator];
					const leftArray = Array.isArray(left) ? left : [leftClause];
					const rightArray = Array.isArray(right) ? right : [rightClause];
					return { [node.operator]: [...leftArray, ...rightArray] } as TFilter;

				case "condition":
					return this.conditionBuilderFn({
						key: node.key,
						value: node.value,
						isRegex: node.token.includes("regex"),
						isNegated,
						isNumeric: node.token === "keyword_numeric",
						isDate: node.token === "keyword_date",
						operator: node.operator
					});
			}
		};

		const clause = buildClause(ast);

		if (clause && ast.negated && !(clause.NOT && Object.keys(clause).length === 1)) {
			return { NOT: clause } as unknown as TFilter;
		}

		return clause;
	}

	/**
	 * Parse a numeric condition into a Drizzle filter object.
	 * @param cond - The {@linkcode ASTCondition} to parse.
	 * @returns The Drizzle filter object.
	 */
	parseNumeric(cond: ASTCondition): TFilter | number | undefined {
		if (!cond.isNumeric || !cond.operator) return undefined;
		if (typeof cond.value !== "number") return undefined;

		const op = operatorMap.get(cond.operator);
		const value = cond.value;

		// If the value is NaN, return undefined
		if (isNaN(value)) return undefined;

		// If the operator is "=", return the number directly
		if (op === "eq") return value;

		// Otherwise, return the Drizzle filter object
		return op && ({ [op]: value } as unknown as TFilter);
	}

	parseDate(cond: ASTCondition): TFilter | undefined {
		if (!cond.isDate || !cond.operator) return undefined;
		if (!(cond.value instanceof Date)) return undefined;

		const op = operatorMap.get(cond.operator);
		const value = cond.value;

		return op && ({ [op]: value } as unknown as TFilter);
	}

	/**
	 * Parse a search query into a Drizzle filter object.
	 * @param query - The search query string.
	 * @returns The parsed search query.
	 */
	parseDrizzle(query: string): {
		tokens: Token[];
		ast: ASTNode | null;
		astConditions: ASTCondition[];
		where: TFilter | undefined;
		metadata: {
			originalQuery: string;
			parseTime: number;
			hasErrors: boolean;
			errors: ParseError[];
		};
	} {
		const result = this.parse(query);
		const where = this.buildWhereClause(result.ast);
		return {
			...result,
			where
		};
	}
}
