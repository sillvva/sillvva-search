import type { ExtractTablesWithRelations, Relations, RelationsFilter, RelationsOrder } from "drizzle-orm";
import { QueryParser, type ASTCondition, type ASTNode, type NumericOperator, type ParseResult, type QueryParserOptions } from "./index";

export type DrizzleOperator = "eq" | "gt" | "lt" | "gte" | "lte";

export interface SortCondition {
	dir: "asc" | "desc";
	key: string;
}

export interface DrizzleParseResult<TFilter extends RelationsFilter<any, any>, TOrder extends RelationsOrder<any>>
	extends Omit<ParseResult, "astConditions"> {
	/**
	 * The Drizzle-compatible filter object.
	 */
	where: TFilter | undefined;
	/**
	 * The Drizzle-compatible orderBy object.
	 */
	orderBy: TOrder | undefined;
	/**
	 * Conditions that were included and excluded from the Drizzle-compatible filter object.
	 */
	conditions: {
		/**
		 * Conditions that were included in the Drizzle-compatible where object.
		 */
		filtered: ASTCondition[];
		/**
		 * Conditions that were included in the Drizzle-compatible orderBy object.
		 */
		sorted: SortCondition[];
		/**
		 * Conditions that were excluded from the Drizzle-compatible where and orderBy objects.
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

type DrizzleParserOptions<TFilter extends RelationsFilter<any, any>, TOrder extends RelationsOrder<any>> = QueryParserOptions & {
	/**
	 * The function to build the Drizzle filter object from the {@linkcode ASTCondition}.
	 */
	filterFn: (ast: ASTCondition) => TFilter | undefined;
	/**
	 * The function to build the Drizzle order object from the {@linkcode SortCondition}.
	 */
	orderFn?: (ast: SortCondition) => TOrder | undefined;
};

/**
 * A parser for Drizzle ORM that extends {@link QueryParser} to parse advanced search queries into Drizzle-compatible filter objects.
 * @typeParam TRelations - The relations of the Drizzle schema returned by {@link defineRelations}.
 * @typeParam TableName - The name of the table to search. See {@link QueryParserOptions}
 *
 * @example
 * You can see a demo of this on [CodeSandbox](https://codesandbox.io/p/devbox/d4d36t?file=%2Flib%2Fsearch%2Fcharacter.ts).
 *
 * ```ts
 * import { DrizzleSearchParser } from "@sillvva/search/drizzle";
 * import { relations } from "./schema";
 *
 * const validKeys = ["name", "age"] as const;
 * const defaultKey = "name" as const satisfies (typeof validKeys)[number];
 *
 * // Instantiate the parser
 * const parser = new DrizzleSearchParser<typeof relations, "user">({
 * 	validKeys,
 * 	defaultKey,
 * 	filterFn: (cond) => {
 * 		const key = (cond.key?.toLowerCase() || defaultKey) as (typeof validKeys)[number];
 * 		switch(key) {
 * 			case "name":
 * 				return { name: { ilike: `%${cond.value}%` } };
 * 			case "age":
 * 				const op = parser.parseNumeric(cond);
 * 				return op && { age: op };
 * 			default:
 * 				return;
 * 		}
 * 	}
 * 	orderFn: (cond) => {
 * 		const key = (String(cond.value)?.toLowerCase() || defaultKey) as (typeof validKeys)[number];
 * 		switch(key) {
 * 			case "name":
 * 			case "age":
 * 				return { [key]: cond.key === "asc" ? "asc" : "desc" };
 * 			default:
 * 				return;
 * 		}
 * 	}
 * });
 *
 * // Parse a query string ✅
 * const { where, orderBy } = parser.parse("name:John age>=30 desc:age");
 * // where: { AND: [{ name: { ilike: "%John%" } }, { age: { gte: 30 } }] }
 * // orderBy: { age: "desc" }
 *
 * // Invalid age ❌
 * const { where, orderBy } = parser.parse("name:John age:thirty");
 * // where: { AND: [{ name: { ilike: "%John%" } }] }
 * // orderBy: undefined
 *
 * // Usage
 * const users = await db.query.user.findMany({ where, orderBy });
 * ```
 */
export class DrizzleSearchParser<
	TRelations extends Relations<any, any, any>,
	TableName extends keyof TRSchema,
	TRSchema extends ExtractTablesWithRelations<TRelations> = ExtractTablesWithRelations<TRelations>,
	TFilter extends RelationsFilter<TRSchema[TableName], TRSchema> = RelationsFilter<TRSchema[TableName], TRSchema>,
	TOrder extends RelationsOrder<TRSchema[TableName]["columns"]> = RelationsOrder<TRSchema[TableName]["columns"]>
> extends QueryParser {
	/**
	 * @param options {@linkcode DrizzleParserOptions} - The options for the parser.
	 * @param options.filterFn - The function to build the Drizzle filter object from the {@linkcode ASTCondition}.
	 * @param options.orderFn - The function to build the Drizzle order object from the {@linkcode SortCondition}.
	 * @param options.validKeys - The valid keys for the parser.
	 * @param options.defaultKey - The default key for the parser.
	 */
	constructor(protected options: DrizzleParserOptions<TFilter, TOrder>) {
		if (options.validKeys) {
			if (!options.validKeys.includes("asc")) options.validKeys = [...options.validKeys, "asc"] as const;
			if (!options.validKeys.includes("desc")) options.validKeys = [...options.validKeys, "desc"] as const;
		}
		super(options);
	}

	get validKeys() {
		return this.options.validKeys;
	}

	// Build where clause object from Abstract Syntax Tree
	private buildWhereClause(
		ast: ASTNode | null,
		parentNegated = false,
		filtered: ASTCondition[] = [],
		excluded: ASTCondition[] = []
	): TFilter | undefined {
		if (!ast) return;

		const isNegated = parentNegated || ast.negated === true;

		const buildClause = (node: ASTNode): TFilter | undefined => {
			switch (node.type) {
				case "binary": {
					const leftClause = this.buildWhereClause(node.left, isNegated, filtered, excluded);
					const rightClause = this.buildWhereClause(node.right, isNegated, filtered, excluded);

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
						operator: node.operator,
						position: node.position
					};

					if (node.key === "asc" || node.key === "desc") {
						excluded.push(cond);
						return;
					}

					const filter = this.options.filterFn(cond);
					if (filter) filtered.push(cond);
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
	 * @param cond {@linkcode ASTCondition} - The condition to parse.
	 * @returns The Drizzle filter object.
	 */
	parseNumeric(cond: ASTCondition): TFilter | number | undefined {
		if (!cond.isNumeric || !cond.operator || typeof cond.value !== "number" || isNaN(cond.value)) return;

		const op = operatorMap.get(cond.operator);
		const value = cond.value;

		// If the operator is "=", return the number directly
		if (op === "eq") return value;

		// Otherwise, return the Drizzle filter object
		return op && ({ [op]: value } as unknown as TFilter);
	}

	/**
	 * Parse a date condition into a Drizzle filter object.
	 * @param cond {@linkcode ASTCondition} - The condition to parse.
	 * @param options {@linkcode ParseDateOptions} - The options for the date format.
	 * @param options.dateFormat - The date format to use. `"date"` (default) or `"unix"`.
	 * @returns The Drizzle filter object.
	 */
	parseDate(cond: ASTCondition, options?: ParseDateOptions): TFilter | undefined {
		if (!cond.isDate || !cond.operator || !(cond.value instanceof Date) || isNaN(cond.value.getTime())) return;

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
	 * @returns The parsed search query. See {@linkcode DrizzleParseResult} for the return type.
	 */
	parse(query: string): DrizzleParseResult<TFilter, TOrder> {
		const { ast, tokens, metadata } = super._parse(query);

		const filtered: ASTCondition[] = [];
		let excluded: ASTCondition[] = [];
		const where = this.buildWhereClause(ast, false, filtered, excluded);

		const sorted: SortCondition[] = [];
		const orderBy = (() => {
			if (!this.options.orderFn) return;
			if (!excluded.filter((cond) => cond.key === "asc" || cond.key === "desc").length) return;

			let orderBy = {} as TOrder;
			for (const cond of excluded) {
				if ((cond.key === "asc" || cond.key === "desc") && typeof cond.value === "string" && orderBy[cond.value] !== cond.key) {
					const sortCondition: SortCondition = {
						dir: cond.key === "asc" ? "asc" : "desc",
						key: cond.value
					};
					const order = this.options.orderFn(sortCondition);
					if (order) {
						sorted.push(sortCondition);
						excluded = excluded.filter((c) => c.key !== cond.key && c.value !== cond.value);
						orderBy = { ...orderBy, ...order };
					}
				}
			}

			return orderBy;
		})();

		return {
			tokens,
			ast,
			metadata,
			where,
			orderBy,
			conditions: {
				filtered,
				sorted,
				excluded
			}
		};
	}
}
