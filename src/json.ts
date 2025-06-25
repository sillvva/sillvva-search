/**
 * This module provides a JSON search utility that extends AdvancedSearchParser to filter arrays of JSON data using advanced search queries.
 * @module
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
 *   { title: "1984", author: "Orwell" }
 * ];
 *
 * const parser = new JSONSearchParser(books, { validKeys: ["title", "author"] });
 * const result = parser.filter('author:Tolkien');
 * // result: [{ title: "The Hobbit", author: "Tolkien" }]
 * ```
 */
import { AdvancedSearchParser, type AdvancedSearchParserOptions, type ASTNode } from "./index";

/**
 * A parser for filtering arrays of JSON data using advanced search queries.
 * @typeParam T - The type of the JSON objects in the array.
 */
export class JSONSearchParser<T extends Record<string, unknown>> extends AdvancedSearchParser {
  private data: T[];
  /**
   * Create a new JSONSearchParser.
   * @param data The array of JSON objects to filter.
   * @param options Configuration options for the parser.
   */
  constructor(data: T[], options?: AdvancedSearchParserOptions) {
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
      let match = false;
      if (ast.token.includes("regex")) {
        try {
          match = new RegExp(ast.value).test(value as string);
        } catch {
          match = false;
        }
      } else {
        match = (value as string).toLowerCase() === ast.value.toLowerCase();
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
    const { ast } = super.parse(query);
    if (!ast) return this.data;
    return this.data.filter(item => this.matchesAST(ast, item));
  }
} 