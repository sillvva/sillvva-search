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
const LOGICAL_OPERATORS = ["AND", "OR", "&", "|"] as const;
type LogicalOperator = (typeof LOGICAL_OPERATORS)[number];

const isLogicalOperator = (str: string): str is LogicalOperator => LOGICAL_OPERATORS.includes(str as LogicalOperator);

/**
 * Represents a numeric operator in a search query.
 */
export type NumericOperator = "=" | ">" | "<" | ">=" | "<=";

/**
 * Represents a token parsed from the search query string.
 */
export type Token =
	| { type: "keyword"; key: string; value: string; position: number }
	| { type: "keyword_phrase"; key: string; value: string; position: number }
	| { type: "keyword_regex"; key: string; value: string; position: number }
	| { type: "keyword_numeric"; key: string; operator: NumericOperator; value: number; position: number }
	| { type: "keyword_date"; key: string; operator: NumericOperator; value: Date; position: number }
	| { type: "word"; value: string; position: number }
	| { type: "phrase"; value: string; position: number }
	| { type: "regex"; value: string; position: number }
	| { type: "operator"; value: LogicalOperator; position: number }
	| { type: "open_paren"; negated?: boolean; position: number }
	| { type: "close_paren"; position: number }
	| { type: "negation"; position: number };

export type ConditionToken = "keyword" | "keyword_phrase" | "keyword_regex" | "keyword_numeric" | "keyword_date" | "word" | "phrase" | "regex";

/**
 * Represents a node in the Abstract Syntax Tree (AST) for a search query.
 */
export type ASTNode = BinaryNode | ConditionNode;

/**
 * A binary node in the Abstract Syntax Tree (AST), representing a logical operation (AND/OR) between two nodes.
 */
export interface BinaryNode {
	type: "binary";
	operator: LogicalOperator;
	left: ASTNode;
	right: ASTNode;
	negated?: boolean;
}

/**
 * A condition node in the Abstract Syntax Tree (AST), representing a single search condition.
 */
export interface ConditionNode {
	type: "condition";
	token: ConditionToken;
	key?: string;
	value: string | number | Date;
	position: number;
	negated?: boolean;
	operator?: NumericOperator;
}

/**
 * Represents a flattened search condition extracted from the Abstract Syntax Tree (AST).
 */
export interface ASTCondition {
	/** The key for the condition, if any (e.g., 'author'). */
	key?: string;
	/** The value for the condition (e.g., 'Tolkien'). */
	value: string | number | Date;
	/** The position of the condition in the query string. */
	position: number;
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
 * Options for configuring the {@link QueryParser} parser.
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
	/**
	 * The type of error that occurred.
	 */
	type: "syntax" | "invalid_key";
	/**
	 * The message describing the error.
	 */
	message: string;
	/**
	 * The position in the query string where the error occurred.
	 */
	position: number;
	/**
	 * The key that was invalid, if applicable.
	 */
	key?: string;
	/**
	 * The value that was invalid, if applicable.
	 */
	value?: string;
}

export interface ParseMetadata {
	/**
	 * The original query string that was parsed.
	 */
	originalQuery: string;
	/**
	 * The time it took to parse the query.
	 */
	parseTime: number;
	/**
	 * Whether the query had any errors.
	 */
	hasErrors: boolean;
	/**
	 * The errors that occurred during the parse operation.
	 */
	errors: ParseError[];
}

export interface ParseResult {
	/**
	 * The tokens that were parsed from the query.
	 */
	tokens: Token[];
	/**
	 * The Abstract Syntax Tree (AST) of the query.
	 */
	ast: ASTNode | null;
	/**
	 * The conditions that were extracted from the AST.
	 */
	astConditions: ASTCondition[];
	/**
	 * Metadata about the parse operation.
	 */
	metadata: ParseMetadata;
}

/**
 * A parser and analyzer for advanced search queries. Supports tokenization and abstract syntax tree generation.
 *
 * This is a base class intended for creating a parser class. For example, the Abstract Syntax Tree (AST) can be parsed into a `where` filter object for a database ORM such as Drizzle.
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
 *   { type: 'keyword', key: 'author', value: 'Tolkien', position: 0 },
 *   { type: 'negation', position: 15 },
 *   { type: 'keyword_phrase', key: 'title', value: 'The Hobbit', position: 16 }
 * ]
 * ```
 * ### Abstract Syntax Tree
 * ```js
 * {
 *   type: 'binary',
 *   operator: 'AND',
 *   left: { type: 'condition', token: 'keyword', key: 'author', value: 'Tolkien', position: 0 },
 *   right: { type: 'condition', token: 'keyword_phrase', key: 'title', value: 'The Hobbit', negated: true, position: 16 }
 * }
 * ```
 * ### AST Conditions
 * ```js
 * [
 *   { key: 'author', value: 'Tolkien', isNegated: false, isRegex: false, isNumeric: false, isDate: false, position: 0 },
 *   { key: 'title', value: 'The Hobbit', isNegated: true, isRegex: false, isNumeric: false, isDate: false, position: 16 }
 * ]
 * ```
 */
export class QueryParser {
	constructor(protected options?: QueryParserOptions) {}

	private tokenize(query: string): { tokens: Token[]; errors: ParseError[] } {
		const errors: ParseError[] = [];
		const tokens: Token[] = [];
		const regexes: string[] = [];

		// Logical grouping (open/close)
		regexes.push(/(?: |^)?(-?\()|(\))/g.source);

		// Negation (negation)
		regexes.push(/(?: |^)([-!])/g.source);

		const dateTimeRegex = /(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?)/g.source;
		const timeRegex = /(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)/g.source;
		const monthRegex = /(\d{4}-\d{2})/g.source;
		const yearRegex = /(\d{4})/g.source;
		const numberRegex = /(-?\d+(?:\.\d+)?)/g.source;
		const rangeRegex = /\.{2}/g.source;

		// Date and number ranges (keywordRange/date1/date2/month1/month2/year1/year2/numeric1/numeric2)
		const dateRangeRegex = `${dateTimeRegex}${rangeRegex}${dateTimeRegex}`;
		const monthRangeRegex = `${monthRegex}${rangeRegex}${monthRegex}`;
		const yearRangeRegex = `${yearRegex}${rangeRegex}${yearRegex}`;
		const numberRangeRegex = `${numberRegex}${rangeRegex}${numberRegex}`;
		regexes.push(`(\\w+)(?::|=)(?:${dateRangeRegex}|${monthRangeRegex}|${yearRangeRegex}|${numberRangeRegex})`);

		// Numeric comparison (keywordNumeric/operator/dateValue/monthValue/yearValue/numericValue)
		regexes.push(`(\\w+)(:|=|>=|<=|>|<)(?:${dateTimeRegex}|${monthRegex}|${yearRegex}|${numberRegex})`);

		// Text (keyword/value/quote/regex) - now includes single-char operators
		regexes.push(/(?:(\w+):)?(?:(\w+|[&|])|"([^"]+)"|\/([^\/]+)\/)/g.source);

		// Any non-whitespace (other)
		regexes.push(/([^\s]+)/g.source);

		const regex = new RegExp(regexes.join("|"), "g");

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
					tokens.push({ type: "open_paren", negated: open.startsWith("-") || open.startsWith("!"), position: match.index });
				} else if (close) {
					tokens.push({ type: "close_paren", position: match.index });
				} else if (negation) {
					tokens.push({ type: "negation", position: match.index });
				} else if (keyword && (value || quote || regex)) {
					if (this.options?.validKeys && !this.options.validKeys.includes(keyword)) {
						if (tokens.at(-1)?.type === "negation") tokens.pop();
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
							value: value,
							position: match.index
						});
					} else if (quote) {
						tokens.push({
							type: "keyword_phrase",
							key: keyword,
							value: quote,
							position: match.index
						});
					} else if (regex) {
						tokens.push({
							type: "keyword_regex",
							key: keyword,
							value: regex,
							position: match.index
						});
					}
				} else if (keywordRange) {
					if (this.options?.validKeys && !this.options.validKeys.includes(keywordRange)) {
						if (tokens.at(-1)?.type === "negation") tokens.pop();
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

						if (date1 && !date1.match(timeRegex)) {
							end.setUTCDate(end.getUTCDate() + 1);
							end.setMilliseconds(-1);
						} else if (month1) {
							end.setUTCMonth(end.getUTCMonth() + 1);
							end.setMilliseconds(-1);
						} else if (year1) {
							end.setUTCFullYear(end.getUTCFullYear() + 1);
							end.setMilliseconds(-1);
						}

						if (tokens.at(-1)?.type === "negation") {
							tokens.pop();
							tokens.push({ type: "open_paren", negated: true, position: match.index });
						} else tokens.push({ type: "open_paren", position: match.index });
						tokens.push({
							type: "keyword_date",
							key: keywordRange,
							operator: ">=",
							value: start,
							position: match.index
						});
						tokens.push({
							type: "keyword_date",
							key: keywordRange,
							operator: "<=",
							value: end,
							position: match.index
						});
						tokens.push({ type: "close_paren", position: match.index });
					} else if (numeric1 && numeric2) {
						let start = parseFloat(numeric1);
						if (isNaN(start)) continue;
						let end = parseFloat(numeric2);
						if (isNaN(end)) continue;

						tokens.push({
							type: "keyword_numeric",
							key: keywordRange,
							operator: ">=",
							value: start,
							position: match.index
						});
						tokens.push({
							type: "keyword_numeric",
							key: keywordRange,
							operator: "<=",
							value: end,
							position: match.index
						});
					}
				} else if (keywordNumeric && operator && numericValue) {
					if (this.options?.validKeys && !this.options.validKeys.includes(keywordNumeric)) {
						if (tokens.at(-1)?.type === "negation") tokens.pop();
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
						value: value,
						position: match.index
					});
				} else if (keywordNumeric && operator && (dateValue || monthValue || yearValue)) {
					if (this.options?.validKeys && !this.options.validKeys.includes(keywordNumeric)) {
						if (tokens.at(-1)?.type === "negation") tokens.pop();
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
							value: start,
							position: match.index
						});
					} else {
						const end = new Date(start);
						const hasTime = dateValue?.match(timeRegex);
						if (dateValue && !hasTime) {
							end.setUTCDate(end.getUTCDate() + 1);
							end.setMilliseconds(-1);
						} else if (monthValue) {
							end.setUTCMonth(end.getUTCMonth() + 1);
							end.setMilliseconds(-1);
						} else if (yearValue) {
							end.setUTCFullYear(end.getUTCFullYear() + 1);
							end.setMilliseconds(-1);
						}

						if (op === "<=" || op === ">") {
							tokens.push({
								type: "keyword_date",
								key: keywordNumeric,
								operator: op,
								value: end,
								position: match.index
							});
						} else if (hasTime) {
							tokens.push({
								type: "keyword_date",
								key: keywordNumeric,
								operator: "=",
								value: start,
								position: match.index
							});
						} else {
							if (tokens.at(-1)?.type === "negation") {
								tokens.pop();
								tokens.push({ type: "open_paren", negated: true, position: match.index });
							} else tokens.push({ type: "open_paren", position: match.index });
							tokens.push({
								type: "keyword_date",
								key: keywordNumeric,
								operator: ">=",
								value: start,
								position: match.index
							});
							tokens.push({
								type: "keyword_date",
								key: keywordNumeric,
								operator: "<=",
								value: end,
								position: match.index
							});
							tokens.push({ type: "close_paren", position: match.index });
						}
					}
				} else if (value) {
					const upperValue = value.toUpperCase();

					if (isLogicalOperator(upperValue)) {
						tokens.push({ type: "operator", value: upperValue, position: match.index });
					} else if (this.options?.defaultKey) {
						tokens.push({ type: "keyword", key: this.options.defaultKey, value, position: match.index });
					} else {
						tokens.push({ type: "word", value, position: match.index });
					}
				} else if (quote) {
					if (this.options?.defaultKey) {
						tokens.push({ type: "keyword_phrase", key: this.options.defaultKey, value: quote, position: match.index });
					} else {
						tokens.push({ type: "phrase", value: quote, position: match.index });
					}
				} else if (regex) {
					if (this.options?.defaultKey) {
						tokens.push({ type: "keyword_regex", key: this.options.defaultKey, value: regex, position: match.index });
					} else {
						tokens.push({ type: "regex", value: regex, position: match.index });
					}
				}
			}
		}

		// Remove consecutive operators or parentheses
		for (let i = 0; i < tokens.length; i++) {
			if (["open_paren"].includes(tokens[i]?.type || "") && ["close_paren"].includes(tokens[i + 1]?.type || "")) {
				tokens.splice(i, 2);
				if (tokens[i - 1]?.type === "negation") {
					tokens.splice(i - 1, 1);
				}
				i--;
			} else if (["operator"].includes(tokens[i]?.type || "") && ["operator", "close_paren"].includes(tokens[i + 1]?.type || "")) {
				tokens.splice(i, 1);
				i--;
			} else if (["open_paren"].includes(tokens[i]?.type || "") && ["operator"].includes(tokens[i + 1]?.type || "")) {
				tokens.splice(i + 1, 1);
			}
		}

		return { tokens, errors };
	}

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
						value: token.value,
						position: token.position
					};

				case "keyword_numeric":
				case "keyword_date":
					return {
						type: "condition",
						token: token.type,
						key: token.key,
						value: token.value,
						operator: token.operator,
						position: token.position
					};

				case "word":
				case "phrase":
				case "regex":
					return { type: "condition", token: token.type, value: token.value, position: token.position };

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
							operator: ast.operator,
							position: ast.position
						}
					];
				}
				return [];
		}
	}

	private normalizeQuery(str: string) {
		return (
			str
				// Normalize multiple spaces to single space
				.replace(/\s+/g, " ")
				// Remove leading/trailing spaces
				.trim()
		);
	}

	/**
	 * Parse a search query string into tokens, an Abstract Syntax Tree, and an array of conditions.
	 * @param query The search query string to parse.
	 * @returns An object containing the tokens, AST, and extracted conditions.
	 */
	protected _parse(query: string): ParseResult {
		const start = performance.now();
		query = this.normalizeQuery(query);
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
