/**
 * This module provides utilities for parsing and analyzing advanced search queries, including tokenization and abstract syntax tree generation.
 * @module
 *
 * ### AdvancedSearchParser
 *
 * This is a base class intended for creating a parser class. For example, the AST can be parsed into a `where` filter object for a database ORM such as Drizzle. See the DrizzleSearchParser and JSONSearchParser classes for examples.
 *
 * @example
 * ```ts
 * import { AdvancedSearchParser } from "@sillvva/search";
 *
 * const query = new AdvancedSearchParser({ validKeys: ["title", "author"] });
 * const result = query.parse('author:Tolkien -title:"The Hobbit"');
 * console.log(result.tokens);
 * console.log(result.ast);
 * console.log(result.astConditions);
 * ```
 * Tokens:
 * ```json
 * [
 *   { type: 'keyword', key: 'author', value: 'Tolkien' },
 *   { type: 'negation' },
 *   { type: 'keyword_phrase', key: 'title', value: 'The Hobbit' }
 * ]
 * ```
 * Abstract Syntax Tree:
 * ```json
 * {
 *   type: 'binary',
 *   operator: 'AND',
 *   left: { type: 'condition', token: 'keyword', key: 'author', value: 'Tolkien' },
 *   right: { type: 'condition', token: 'keyword_phrase', key: 'title', value: 'The Hobbit', negated: true }
 * }
 * ```
 * AST Conditions:
 * ```json
 * [
 *   { key: 'author', value: 'Tolkien', isRegex: false, isNegated: false },
 *   { key: 'title', value: 'The Hobbit', isRegex: false, isNegated: true }
 * ]
 * ```
 *
 * ### JSONSearchParser
 *
 * JSONSearchParser is a class that extends the AdvancedSearchParser class and provides a filter method that filters an array of JSON data using a search query.
 *
 * @example
 * ```ts
 * const query = new JSONSearchParser(books, { validKeys: ["title", "author"] });
 * const filteredBooks = query.filter('author:Tolkien -title:"The Hobbit"');
 * ```
 *
 * ### DrizzleSearchParser
 *
 * DrizzleSearchParser is a class that extends the AdvancedSearchParser class and provides a parseDrizzle method that parses a search query into a Drizzle-compatible filter object.
 *
 * @example
 * ```ts
 * import { DrizzleSearchParser } from "@sillvva/search/drizzle";
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
 * }, { validKeys: ["name", "age"] });
 *
 * // Parse a query string ✅
 * const { where } = parser.parseDrizzle("name:John AND age>=30");
 * // where: { AND: [{ name: { ilike: "%John%" } }, { age: { gte: 30 } }] }
 *
 * // Invalid age ❌
 * const { where } = parser.parseDrizzle("name:John age:thirty");
 * // where: { AND: [{ name: { ilike: "%John%" } }] }
 *
 * // Usage
 * const users = await db.query.user.findMany({ where });
 * ```
 */

/**
 * Represents a logical operator in a search query.
 */
type Operator = "AND" | "OR";

/**
 * Represents a numeric operator in a search query.
 */
export type NumericOperator = "=" | ">" | "<" | ">=" | "<=";

/**
 * Represents a token parsed from the search query string.
 */
export type Token =
	| { type: "keyword"; key: string; value: string }
	| { type: "keyword_phrase"; key: string; value: string }
	| { type: "keyword_regex"; key: string; value: string }
	| { type: "keyword_numeric"; key: string; operator: NumericOperator; value: number }
	| { type: "word"; value: string }
	| { type: "phrase"; value: string }
	| { type: "regex"; value: string }
	| { type: "operator"; value: Operator }
	| { type: "open_paren"; negated?: boolean }
	| { type: "close_paren" }
	| { type: "negation" };

/**
 * Represents a node in the abstract syntax tree (AST) for a search query.
 */
export type ASTNode = BinaryNode | ConditionNode;

/**
 * A binary node in the AST, representing a logical operation (AND/OR) between two nodes.
 */
interface BinaryNode {
	type: "binary";
	operator: Operator;
	left: ASTNode;
	right: ASTNode;
	negated?: boolean;
}

/**
 * A condition node in the AST, representing a single search condition.
 */
interface ConditionNode {
	type: "condition";
	token: Token["type"];
	key?: string;
	value: string | number;
	negated?: boolean;
	operator?: NumericOperator;
}

/**
 * Represents a flattened search condition extracted from the AST.
 */
export interface ASTCondition {
	/** The key for the condition, if any (e.g., 'author'). */
	key?: string;
	/** The value for the condition (e.g., 'Tolkien'). */
	value: string | number;
	/** Whether the value is a regex pattern. */
	isRegex: boolean;
	/** Whether the condition is negated. */
	isNegated: boolean;
	/** Whether the condition is numeric. */
	isNumeric: boolean;
	/** The numeric operator, if applicable. */
	operator?: NumericOperator;
}

/**
 * Options for configuring the AdvancedSearchParser parser.
 */
export interface AdvancedSearchParserOptions {
	/**
	 * An optional list of valid keys to allow in the search query. If specified, only these keys will be recognized.
	 */
	validKeys?: readonly string[];
}

/**
 * A parser and analyzer for advanced search queries. Supports tokenization and abstract syntax tree generation.
 *
 * This is a base class for creating a parser class. For example, the AST can be parsed into a `where` filter object for a database ORM such as Drizzle.
 */
export class AdvancedSearchParser {
	/**
	 * Create a new AdvancedSearchParser parser.
	 * @param options Configuration options for the parser.
	 */
	constructor(private options?: AdvancedSearchParserOptions) {}

	// Convert query to tokens
	private tokenize(query: string): Token[] {
		const tokens: Token[] = [];
		const regex = /(-?\()|(\))|(-)|(\w+)(:|=|>=|<=|>|<)(-?\d+(?:\.\d+)?)|(?:(\w+):)?(?:(\w+)|"([^"]+)"|\/([^\/]+)\/)/g;
		let match: RegExpExecArray | null;

		while (match = regex.exec(query)) {
			const [, open, close, negation, keywordNumeric, operator, numericValue, keyword, value, quote, regex] = match;

			if (open) {
				tokens.push({ type: "open_paren", negated: open.startsWith("-") });
			} else if (close) {
				tokens.push({ type: "close_paren" });
			} else if (negation) {
				tokens.push({ type: "negation" });
			} else if (keyword && (value || quote || regex)) {
				// Filter out invalid keys if validKeys is specified
				if (this.options?.validKeys && !this.options.validKeys.includes(keyword)) {
					continue;
				}

				if (value) {
					tokens.push({
						type: "keyword",
						key: keyword,
						value: value
					});
				} else if (quote) {
					tokens.push({
						type: "keyword_phrase",
						key: keyword,
						value: quote
					});
				} else if (regex) {
					tokens.push({
						type: "keyword_regex",
						key: keyword,
						value: regex
					});
				}
			} else if (keywordNumeric && operator && numericValue) {
				// Filter out invalid keys if validKeys is specified
				if (this.options?.validKeys && !this.options.validKeys.includes(keywordNumeric)) {
					continue;
				}

				tokens.push({
					type: "keyword_numeric",
					key: keywordNumeric,
					operator: operator === ":" ? "=" : (operator as NumericOperator),
					value: parseFloat(numericValue)
				});
			} else if (value) {
				const upperValue = value.toUpperCase();

				if (upperValue === "AND" || upperValue === "OR") {
					tokens.push({ type: "operator", value: upperValue });
				} else {
					tokens.push({ type: "word", value });
				}
			} else if (quote) {
				tokens.push({ type: "phrase", value: quote });
			} else if (regex) {
				tokens.push({ type: "regex", value: regex });
			}
		}

		return tokens;
	}

	// Convert tokens to Abstract Syntax Tree
	private buildAST(tokens: Token[]): ASTNode | null {
		let index = 0;

		function parseExpression(): ASTNode | null {
			let left = parseTerm();
			if (!left) return null;

			while (index < tokens.length) {
				const currentToken = tokens[index];

				if (currentToken?.type === "close_paren") break;

				let operator: Operator;
				if (currentToken?.type === "operator") {
					operator = currentToken.value;
					index++;
				} else if (isStartOfTerm(currentToken)) {
					operator = "AND";
				} else {
					break;
				}

				const right = parseTerm();
				if (!right) break;

				left = { type: "binary", operator, left, right };
			}

			return left;
		}

		function parseTerm(): ASTNode | null {
			const token = tokens[index++];

			if (!token) return null;

			switch (token.type) {
				case "negation":
					const negatedTerm = parseTerm();
					if (negatedTerm) {
						negatedTerm.negated = true;
					}
					return negatedTerm;

				case "open_paren":
					const expr = parseExpression();
					index++; // consume close_paren
					if (expr && token.negated) {
						expr.negated = true;
					}
					return expr;

				case "keyword":
				case "keyword_phrase":
				case "keyword_regex":
					return {
						type: "condition",
						token: token.type,
						key: token.key,
						value: token.value
					};

				case "keyword_numeric":
					return {
						type: "condition",
						token: token.type,
						key: token.key,
						value: token.value,
						operator: token.operator
					};

				case "word":
				case "phrase":
				case "regex":
					return { type: "condition", token: token.type, value: token.value };

				default:
					return null;
			}
		}

		function isStartOfTerm(token: Token | undefined): boolean {
			if (!token) return false;
			return !(token.type === "close_paren" || token.type === "operator");
		}

		return parseExpression();
	}

	private extractConditions(ast: ASTNode | null, parentNegated = false): ASTCondition[] {
		if (!ast) return [];

		const isNegated = parentNegated || ast.negated === true;

		switch (ast.type) {
			case "binary":
				return [...this.extractConditions(ast.left, isNegated), ...this.extractConditions(ast.right, isNegated)];

			case "condition":
				// Only include if not negated and has a value
				if (ast.value) {
					return [
						{
							key: ast.key,
							value: ast.value,
							isRegex: ast.token.includes("regex"),
							isNegated,
							isNumeric: ast.token === "keyword_numeric",
							operator: ast.operator
						}
					];
				}
				return [];
		}
	}

	/**
	 * Parse a search query string into tokens, an Abstract Syntax Tree, and an array of conditions.
	 * @param query The search query string to parse.
	 * @returns An object containing the tokens, AST, and extracted conditions.
	 */
	protected parse(query: string): {
		tokens: Token[];
		ast: ASTNode | null;
		astConditions: ASTCondition[];
	} {
		const tokens = this.tokenize(query);
		const ast = this.buildAST(tokens);
		const astConditions = this.extractConditions(ast);
		return {
			tokens,
			ast,
			astConditions
		};
	}
}
