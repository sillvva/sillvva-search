import type { ExtractTablesWithRelations, Relations, RelationsFilter } from "drizzle-orm";
import { QueryParser, type ASTCondition, type ASTNode, type NumericOperator, type ParseResult, type QueryParserOptions } from "./index";

export type DrizzleOperator = "eq" | "gt" | "lt" | "gte" | "lte";

export interface DrizzleParseResult<TFilter extends RelationsFilter<any, any>> extends Omit<ParseResult, "astConditions"> {
	/**
	 * The Drizzle-compatible filter object.
	 */
	where: TFilter | undefined;
	/**
	 * Conditions that were included and excluded from the Drizzle-compatible filter object.
	 */
	conditions: {
		/**
		 * Conditions that were included in the Drizzle-compatible filter object.
		 */
		included: ASTCondition[];
		/**
		 * Conditions that were excluded from the Drizzle-compatible filter object.
		 */
		excluded: ASTCondition[];
	};
}

const operatorMap = new Map<NumericOperator, DrizzleOperator>([
	["=", "eq"],
	[">", "gt"],
	["<", "lt"],
	[">=", "gte"],
	["<=", "lte"]
]);

export interface ParseDateOptions {
	dateFormat?: "date" | "unix";
}

/**
 * A parser for Drizzle ORM that extends {@link QueryParser} to parse advanced search queries into Drizzle-compatible filter objects.
 * @typeParam TRelations - The relations of the Drizzle schema returned by {@link defineRelations}.
 * @typeParam TableName - The name of the table to search. See {@link QueryParserOptions}
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
 * const validKeys = ["name", "age"] as const;
 * const defaultKey = "name" as const satisfies (typeof validKeys)[number];
 *
 * // Instantiate the parser
 * const parser = new DrizzleSearchParser<typeof relations, "user">((cond) => {
 * 	 const key = (ast.key?.toLowerCase() || defaultKey) as (typeof validKeys)[number];
 *   if (key === "name") {
 *     return { name: { ilike: `%${cond.value}%` } };
 *   }
 *   if (key === "age") {
 *     const op = parser.parseNumeric(cond);
 *     return op && { age: op };
 *   }
 *   return undefined;
 * }, { validKeys, defaultKey });
 *
 * // Parse a query string ✅
 * const { where } = parser.parse("John age>=30");
 * // where: { AND: [{ name: { ilike: "%John%" } }, { age: { gte: 30 } }] }
 *
 * // Invalid age ❌
 * const { where } = parser.parse("John age:thirty");
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
	/**
	 * @param conditionBuilderFn - The function to build the Drizzle filter object from the AST condition.
	 * @param options - The options for the parser. See {@link QueryParserOptions}
	 */
	constructor(private readonly conditionBuilderFn: (ast: ASTCondition) => TFilter | undefined, options?: QueryParserOptions) {
		super(options);
	}

	// Build where clause object from Abstract Syntax Tree
	private buildWhereClause(
		ast: ASTNode | null,
		parentNegated = false,
		included: ASTCondition[] = [],
		excluded: ASTCondition[] = []
	): TFilter | undefined {
		if (!ast) return;

		const isNegated = parentNegated || ast.negated === true;

		const buildClause = (node: ASTNode): TFilter | undefined => {
			switch (node.type) {
				case "binary": {
					const leftClause = this.buildWhereClause(node.left, isNegated, included, excluded);
					const rightClause = this.buildWhereClause(node.right, isNegated, included, excluded);

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
				}
				case "condition": {
					const cond: ASTCondition = {
						key: node.key,
						value: node.value,
						isRegex: node.token.includes("regex"),
						isNegated,
						isNumeric: node.token === "keyword_numeric",
						isDate: node.token === "keyword_date",
						operator: node.operator
					};
					const filter = this.conditionBuilderFn(cond);
					if (filter) included.push(cond);
					else excluded.push(cond);
					return filter;
				}
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

	/**
	 * Parse a date condition into a Drizzle filter object.
	 * @param cond - The {@linkcode ASTCondition} to parse.
	 * @param options - The options for the date format.
	 * @param options.dateFormat - The date format to use. Defaults to "date".
	 * @returns The Drizzle filter object.
	 */
	parseDate(cond: ASTCondition, options?: ParseDateOptions): TFilter | undefined {
		if (!cond.isDate || !cond.operator) return undefined;
		if (!(cond.value instanceof Date)) return undefined;

		const op = operatorMap.get(cond.operator);
		const value = cond.value;

		if (options?.dateFormat === "unix") {
			return op && ({ [op]: Math.floor(value.getTime() / 1000) } as unknown as TFilter);
		}

		return op && ({ [op]: value } as unknown as TFilter);
	}

	/**
	 * Parse a search query into a Drizzle filter object.
	 * @param query - The search query string.
	 * @returns The parsed search query. See {@link DrizzleParseResult} for the return type.
	 */
	parse(query: string): DrizzleParseResult<TFilter> {
		const { ast, tokens, metadata } = super.parse(query);

		const included: ASTCondition[] = [];
		const excluded: ASTCondition[] = [];
		const where = this.buildWhereClause(ast, false, included, excluded);

		return {
			tokens,
			ast,
			metadata,
			where,
			conditions: {
				included,
				excluded
			}
		};
	}
}
