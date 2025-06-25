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
import { AdvancedSearchParser, type ASTNode } from "./index";

/**
 * A parser for filtering arrays of JSON data using advanced search queries.
 * @typeParam T - The type of the JSON objects in the array.
 */
export class JSONSearchParser<T extends Record<any, any>> extends AdvancedSearchParser {
  private data: T[];
  /**
   * Create a new JSONSearchParser.
   * @param data The array of JSON objects to filter.
   * @param options Configuration options for the parser.
   */
  constructor(data: T[], options?: { validKeys?: readonly (keyof T & string)[] }) {
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
        match = false;
        if (ast.token === "keyword_numeric") {
          switch (ast.operator) {
            case "=":
              match = Number(value) === Number(ast.value);
              break;
            case ">":
              match = Number(value) > Number(ast.value);
              break;
            case "<":
              match = Number(value) < Number(ast.value);
              break;
            case ">=":
              match = Number(value) >= Number(ast.value);
              break;
            case "<=":
              match = Number(value) <= Number(ast.value);
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
    const { ast } = super.parse(query);
    if (!ast) return this.data;
    return this.data.filter(item => this.matchesAST(ast, item));
  }
} 
