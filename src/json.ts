import { sorter } from "@sillvva/utils";
import { ASTCondition, QueryParser, type ASTNode } from "./index";

interface SortCondition extends ASTCondition {
	key: "asc" | "desc";
	value: string;
}

/**
 A parser for filtering arrays of JSON data using advanced search queries.
 * @typeParam T - The type of the JSON objects in the array.
 *
 * @example
 * ```ts
 * import { JSONSearchParser } from "@sillvva/search/json";
 *
 * interface Book {
 *   title: string;
 *   author: string;
 * }
 *
 * const books: Book[] = [
 *   { title: "The Hobbit", author: "Tolkien" },
 *   { title: "The Lord of the Rings", author: "Tolkien" },
 *   { title: "1984", author: "Orwell" }
 * ];
 *
 * const parser = new JSONSearchParser(books, { validKeys: ["title", "author"], defaultKey: "title" });
 * const result = parser.filter('author:tolkien -hobbit');
 * // result: [{ title: "The Lord of the Rings", author: "Tolkien" }]
 *
 * const result = parser.filter("asc:author asc:title");
 * // result: [
 * //   { title: "1984", author: "Orwell" },
 * //   { title: "The Hobbit", author: "Tolkien" },
 * //   { title: "The Lord of the Rings", author: "Tolkien" }
 * // ]
 */
export class JSONSearchParser<T extends Record<any, any>> extends QueryParser {
	private data: T[];
	/**
	 * Create a new JSONSearchParser.
	 * @param data The array of JSON objects to filter.
	 * @param options Configuration options for the parser.
	 */
	constructor(data: T[], options?: { validKeys?: readonly (keyof T & string)[]; defaultKey?: keyof T & string }) {
		if (options?.validKeys) {
			if (!options.validKeys.includes("asc")) options.validKeys = [...options.validKeys, "asc"] as const;
			if (!options.validKeys.includes("desc")) options.validKeys = [...options.validKeys, "desc"] as const;
		}
		super(options);
		this.data = data;
	}

	private compareValues(a: number | Date, b: number | Date, operator: string): boolean {
		switch (operator) {
			case "=":
				if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
				return a === b;
			case ">":
				return a > b;
			case "<":
				return a < b;
			case ">=":
				return a >= b;
			case "<=":
				return a <= b;
			default:
				return false;
		}
	}

	private matchesAST(ast: ASTNode, item: T): boolean {
		if (ast.type === "binary") {
			const left = this.matchesAST(ast.left, item);
			const right = this.matchesAST(ast.right, item);
			const result = ast.operator === "AND" ? left && right : left || right;
			return ast.negated ? !result : result;
		} else if (ast.type === "condition") {
			if (ast.key === "asc" || ast.key === "desc") return true;
			let value: unknown = ast.key ? item[ast.key] : undefined;
			if (typeof value !== "string") value = String(value ?? "");
			if (ast.key && this.options?.validKeys?.length && !this.options.validKeys.includes(ast.key)) return false;
			let match = false;
			if (ast.token === "regex" || ast.token === "keyword_regex") {
				try {
					match = new RegExp(String(ast.value)).test(String(value));
				} catch {
					match = false;
				}
			} else {
				if (ast.token === "keyword_numeric" || ast.token === "keyword_date") {
					if (ast.token === "keyword_numeric" && typeof ast.value === "number") {
						match = this.compareValues(Number(value), Number(ast.value), ast.operator ?? "=");
					} else if (ast.token === "keyword_date" && ast.value instanceof Date && typeof value === "string") {
						match = this.compareValues(new Date(value), ast.value, ast.operator ?? "=");
					}
				} else {
					match = String(value).toLowerCase().includes(String(ast.value).toLowerCase());
				}
			}
			return ast.negated ? !match : match;
		}
		return false;
	}

	/**
	 * Filter the array of JSON data using a search query.
	 * @param query The search query string.
	 * @returns The filtered array of JSON objects matching the query.
	 */
	filter(query: string): T[] {
		const { ast, astConditions } = super._parse(query);

		const sortConditions = astConditions.filter(
			(cond) => (cond.key === "asc" || cond.key === "desc") && typeof cond.value === "string"
		) as SortCondition[];

		return this.data
			.filter((item) => ast && this.matchesAST(ast, item))
			.toSorted((a, b) => {
				for (const cond of sortConditions) {
					const av = a[cond.value];
					const bv = b[cond.value];
					const result = cond.key === "asc" ? sorter(av, bv) : sorter(bv, av);
					if (result !== 0) return result;
				}
				return 0;
			});
	}
}
