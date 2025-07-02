import { QueryParser, type ASTNode } from "./index";

/**
 * A parser for filtering arrays of JSON data using advanced search queries.
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
 */
export class JSONSearchParser<T extends Record<any, any>> extends QueryParser {
	private data: T[];
	/**
	 * Create a new JSONSearchParser.
	 * @param data The array of JSON objects to filter.
	 * @param options Configuration options for the parser.
	 */
	constructor(data: T[], options?: { validKeys?: readonly (keyof T & string)[]; defaultKey?: keyof T & string }) {
		super(options);
		this.data = data;
	}

	private matchesAST(ast: ASTNode, item: T): boolean {
		if (ast.type === "binary") {
			const left = this.matchesAST(ast.left, item);
			const right = this.matchesAST(ast.right, item);
			const result = ast.operator === "AND" ? left && right : left || right;
			return ast.negated ? !result : result;
		} else if (ast.type === "condition") {
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
					switch (ast.operator) {
						case "=":
							if (ast.token === "keyword_numeric" && typeof ast.value === "number") {
								match = Number(value) === Number(ast.value);
							} else if (ast.token === "keyword_date" && ast.value instanceof Date && typeof value === "string") {
								match = new Date(value).getTime() === ast.value.getTime();
							}
							break;
						case ">":
							if (ast.token === "keyword_numeric" && typeof ast.value === "number") {
								match = Number(value) > Number(ast.value);
							} else if (ast.token === "keyword_date" && ast.value instanceof Date && typeof value === "string") {
								match = new Date(value) > ast.value;
							}
							break;
						case "<":
							if (ast.token === "keyword_numeric" && typeof ast.value === "number") {
								match = Number(value) < Number(ast.value);
							} else if (ast.token === "keyword_date" && ast.value instanceof Date && typeof value === "string") {
								match = new Date(value) < ast.value;
							}
							break;
						case ">=":
							if (ast.token === "keyword_numeric" && typeof ast.value === "number") {
								match = Number(value) >= Number(ast.value);
							} else if (ast.token === "keyword_date" && ast.value instanceof Date && typeof value === "string") {
								match = new Date(value) >= ast.value;
							}
							break;
						case "<=":
							if (ast.token === "keyword_numeric" && typeof ast.value === "number") {
								match = Number(value) <= Number(ast.value);
							} else if (ast.token === "keyword_date" && ast.value instanceof Date && typeof value === "string") {
								match = new Date(value) <= ast.value;
							}
							break;
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
		const { ast } = super._parse(query);
		if (!ast) return this.data;
		return this.data.filter((item) => this.matchesAST(ast, item));
	}
}
