// MIT License

// Copyright (c) 2025 Matt DeKok

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/**
 * Represents a logical operator in a search query.
 */
export type LogicalOperator = "AND" | "OR";

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
	| { type: "keyword_date"; key: string; operator: NumericOperator; value: Date }
	| { type: "word"; value: string }
	| { type: "phrase"; value: string }
	| { type: "regex"; value: string }
	| { type: "operator"; value: LogicalOperator }
	| { type: "open_paren"; negated?: boolean }
	| { type: "close_paren" }
	| { type: "negation" };

type ConditionToken = "keyword" | "keyword_phrase" | "keyword_regex" | "keyword_numeric" | "keyword_date" | "word" | "phrase" | "regex";

/**
 * Represents a node in the abstract syntax tree (AST) for a search query.
 */
export type ASTNode = BinaryNode | ConditionNode;

/**
 * A binary node in the AST, representing a logical operation (AND/OR) between two nodes.
 */
interface BinaryNode {
	type: "binary";
	operator: LogicalOperator;
	left: ASTNode;
	right: ASTNode;
	negated?: boolean;
}

/**
 * A condition node in the AST, representing a single search condition.
 */
interface ConditionNode {
	type: "condition";
	token: ConditionToken;
	key?: string;
	value: string | number | Date;
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
	value: string | number | Date;
	/** Whether the condition is negated. */
	isNegated: boolean;
	/** Whether the value is a regex pattern. */
	isRegex: boolean;
	/** Whether the condition is numeric. */
	isNumeric: boolean;
	/** Whether the condition is a date. */
	isDate: boolean;
	/** The numeric operator, if applicable. */
	operator?: NumericOperator;
}

/**
 * Options for configuring the QueryParser parser.
 */
export interface QueryParserOptions {
	/**
	 * An optional list of valid keys to allow in the search query. If specified, only these keys will be recognized.
	 */
	validKeys?: readonly string[];
	/**
	 * An optional default key to use if no key is specified in the search query.
	 */
	defaultKey?: string;
}

export interface ParseError {
	type: "syntax" | "invalid_key";
	message: string;
	position: number;
	key?: string;
	value?: string;
}

export interface ParseMetadata {
	originalQuery: string;
	parseTime: number;
	hasErrors: boolean;
	errors: ParseError[];
}

export interface ParseResult {
	tokens: Token[];
	ast: ASTNode | null;
	astConditions: ASTCondition[];
	metadata: ParseMetadata;
}

/**
 * A parser and analyzer for advanced search queries. Supports tokenization and abstract syntax tree generation.
 *
 * This is a base class intended for creating a parser class. For example, the AST can be parsed into a `where` filter object for a database ORM such as Drizzle.
 *
 * @example
 * ```ts
 * import { QueryParser } from "@sillvva/search";
 *
 * const query = new QueryParser({ validKeys: ["title", "author"] });
 * const result = query.parse('author:Tolkien -title:"The Hobbit"');
 *
 * console.log(result.tokens);
 * console.log(result.ast);
 * console.log(result.astConditions);
 * ```
 * ### Tokens
 * ```js
 * [
 *   { type: 'keyword', key: 'author', value: 'Tolkien' },
 *   { type: 'negation' },
 *   { type: 'keyword_phrase', key: 'title', value: 'The Hobbit' }
 * ]
 * ```
 * ### Abstract Syntax Tree
 * ```js
 * {
 *   type: 'binary',
 *   operator: 'AND',
 *   left: { type: 'condition', token: 'keyword', key: 'author', value: 'Tolkien' },
 *   right: { type: 'condition', token: 'keyword_phrase', key: 'title', value: 'The Hobbit', negated: true }
 * }
 * ```
 * ### AST Conditions
 * ```js
 * [
 *   { key: 'author', value: 'Tolkien', isNegated: false, isRegex: false, isNumeric: false, isDate: false },
 *   { key: 'title', value: 'The Hobbit', isNegated: true, isRegex: false, isNumeric: false, isDate: false }
 * ]
 * ```
 */
export class QueryParser {
	constructor(protected options?: QueryParserOptions) {}

	// Convert query to tokens
	private tokenize(query: string): { tokens: Token[]; errors: ParseError[] } {
		const errors: ParseError[] = [];
		const tokens: Token[] = [];

		const regex =
			/(?: |^)(-?\()|(\))|(?: |^)(-)|(\w+):(?:(\d{4}-\d{2}-\d{2})\.{2}(\d{4}-\d{2}-\d{2})|(\d{4}-\d{2})\.{2}(\d{4}-\d{2})|(\d{4})\.{2}(\d{4})|(-?\d+(?:\.\d+)?)\.{2}(-?\d+(?:\.\d+)?))|(\w+)(:|=|>=|<=|>|<)(?:(\d{4}-\d{2}-\d{2})|(\d{4}-\d{2})|(\d{4})|(-?\d+(?:\.\d+)?))|(?:(\w+):)?(?:(\w+)|"([^"]+)"|\/([^\/]+)\/)|([^\s]+)/g;

		if (!query.match(regex)) {
			errors.push({
				type: "syntax",
				message: "Unexpected syntax",
				position: 0,
				value: query
			});
		} else {
			let match: RegExpExecArray | null;
			while ((match = regex.exec(query))) {
				const [
					_,
					open,
					close,
					negation,
					keywordRange,
					date1,
					date2,
					month1,
					month2,
					year1,
					year2,
					numeric1,
					numeric2,
					keywordNumeric,
					operator,
					dateValue,
					monthValue,
					yearValue,
					numericValue,
					keyword,
					value,
					quote,
					regex,
					other
				] = match;

				if (other) {
					errors.push({
						type: "syntax",
						message: "Unexpected syntax",
						position: match.index,
						value: other
					});
					continue;
				}

				if (open) {
					tokens.push({ type: "open_paren", negated: open.startsWith("-") });
				} else if (close) {
					tokens.push({ type: "close_paren" });
				} else if (negation) {
					tokens.push({ type: "negation" });
				} else if (keyword && (value || quote || regex)) {
					// Filter out invalid keys if validKeys is specified
					if (this.options?.validKeys && !this.options.validKeys.includes(keyword)) {
						errors.push({
							type: "invalid_key",
							message: `Invalid key: ${keyword}`,
							position: match.index,
							key: keyword,
							value: value || quote || regex
						});
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
				} else if (keywordRange) {
					if (this.options?.validKeys && !this.options.validKeys.includes(keywordRange)) {
						errors.push({
							type: "invalid_key",
							message: `Invalid key: ${keywordRange}`,
							position: match.index,
							key: keywordRange,
							value: date1 || date2 || month1 || month2 || year1 || year2
						});
						continue;
					}

					if ((date1 && date2) || (month1 && month2) || (year1 && year2)) {
						let start = new Date(date1 || month1 || year1 || "");
						if (isNaN(start.getTime())) continue;
						let end = new Date(date2 || month2 || year2 || "");
						if (isNaN(end.getTime())) continue;

						if (date1) {
							end.setUTCDate(end.getUTCDate() + 1);
						} else if (month1) {
							end.setUTCMonth(end.getUTCMonth() + 1);
						} else {
							end.setUTCFullYear(end.getUTCFullYear() + 1);
						}
						end.setMilliseconds(-1);

						tokens.push({
							type: "keyword_date",
							key: keywordRange,
							operator: ">=",
							value: start
						});
						tokens.push({
							type: "keyword_date",
							key: keywordRange,
							operator: "<=",
							value: end
						});
					} else if (numeric1 && numeric2) {
						let start = parseFloat(numeric1);
						if (isNaN(start)) continue;
						let end = parseFloat(numeric2);
						if (isNaN(end)) continue;

						tokens.push({
							type: "keyword_numeric",
							key: keywordRange,
							operator: ">=",
							value: start
						});
						tokens.push({
							type: "keyword_numeric",
							key: keywordRange,
							operator: "<=",
							value: end
						});
					}
				} else if (keywordNumeric && operator && numericValue) {
					// Filter out invalid keys if validKeys is specified
					if (this.options?.validKeys && !this.options.validKeys.includes(keywordNumeric)) {
						errors.push({
							type: "invalid_key",
							message: `Invalid key: ${keywordNumeric}`,
							position: match.index,
							key: keywordNumeric,
							value: numericValue
						});
						continue;
					}

					const value = parseFloat(numericValue);
					if (isNaN(value)) continue;

					tokens.push({
						type: "keyword_numeric",
						key: keywordNumeric,
						operator: operator === ":" ? "=" : (operator as NumericOperator),
						value: value
					});
				} else if (keywordNumeric && operator && (dateValue || monthValue || yearValue)) {
					// Filter out invalid keys if validKeys is specified
					if (this.options?.validKeys && !this.options.validKeys.includes(keywordNumeric)) {
						errors.push({
							type: "invalid_key",
							message: `Invalid key: ${keywordNumeric}`,
							position: match.index,
							key: keywordNumeric,
							value: dateValue || monthValue || yearValue
						});
						continue;
					}

					let start = new Date(dateValue || monthValue || yearValue || "");
					if (isNaN(start.getTime())) continue;

					let op = operator === ":" ? "=" : (operator as NumericOperator);
					if (op === "<" || op === ">=") {
						tokens.push({
							type: "keyword_date",
							key: keywordNumeric,
							operator: op,
							value: start
						});
					} else {
						const end = new Date(start);
						if (dateValue) {
							end.setUTCDate(end.getUTCDate() + 1);
						} else if (monthValue) {
							end.setUTCMonth(end.getUTCMonth() + 1);
						} else {
							end.setUTCFullYear(end.getUTCFullYear() + 1);
						}
						end.setMilliseconds(-1);

						if (op === "<=" || op === ">") {
							tokens.push({
								type: "keyword_date",
								key: keywordNumeric,
								operator: op,
								value: end
							});
						} else {
							tokens.push({
								type: "keyword_date",
								key: keywordNumeric,
								operator: ">=",
								value: start
							});
							tokens.push({
								type: "keyword_date",
								key: keywordNumeric,
								operator: "<=",
								value: end
							});
						}
					}
				} else if (value) {
					const upperValue = value.toUpperCase();

					if (upperValue === "AND" || upperValue === "OR") {
						tokens.push({ type: "operator", value: upperValue });
					} else if (this.options?.defaultKey) {
						tokens.push({ type: "keyword", key: this.options.defaultKey, value });
					} else {
						tokens.push({ type: "word", value });
					}
				} else if (quote) {
					if (this.options?.defaultKey) {
						tokens.push({ type: "keyword_phrase", key: this.options.defaultKey, value: quote });
					} else {
						tokens.push({ type: "phrase", value: quote });
					}
				} else if (regex) {
					if (this.options?.defaultKey) {
						tokens.push({ type: "keyword_regex", key: this.options.defaultKey, value: regex });
					} else {
						tokens.push({ type: "regex", value: regex });
					}
				}
			}
		}

		return { tokens, errors };
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

				let operator: LogicalOperator;
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
				case "keyword_date":
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
							isNegated,
							isRegex: ast.token.includes("regex"),
							isNumeric: ast.token === "keyword_numeric",
							isDate: ast.token === "keyword_date",
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
	protected parse(query: string): ParseResult {
		const start = performance.now();
		const { tokens, errors } = this.tokenize(query);
		const ast = this.buildAST(tokens);
		const astConditions = this.extractConditions(ast);
		return {
			tokens,
			ast,
			astConditions,
			metadata: {
				originalQuery: query,
				parseTime: performance.now() - start,
				hasErrors: errors.length > 0,
				errors
			}
		};
	}
}
