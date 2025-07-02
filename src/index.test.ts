import { QueryParser } from "./index";

describe("QueryParser", () => {
	it("parses simple word queries", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("hello");
		expect(result.tokens).toEqual([{ type: "word", value: "hello", position: 0 }]);
		expect(result.ast).toEqual({ type: "condition", token: "word", value: "hello", position: 0 });
	});

	it("parses phrase queries", () => {
		const parser = new QueryParser();
		const result = parser["parse"]('"hello world"');
		expect(result.tokens).toEqual([{ type: "phrase", value: "hello world", position: 0 }]);
		expect(result.ast).toEqual({ type: "condition", token: "phrase", value: "hello world", position: 0 });
	});

	it("parses field-specific queries", () => {
		const parser = new QueryParser({ validKeys: ["author", "title"] });
		const result = parser["parse"](`author:Tolkien title:"The Hobbit"`);
		expect(result.tokens).toEqual([
			{ type: "keyword", key: "author", value: "Tolkien", position: 0 },
			{ type: "keyword_phrase", key: "title", value: "The Hobbit", position: 15 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword", key: "author", value: "Tolkien", position: 0 },
			right: { type: "condition", token: "keyword_phrase", key: "title", value: "The Hobbit", position: 15 }
		});
	});

	it("parses exclusions (negation)", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("-hello");
		expect(result.tokens).toEqual([
			{ type: "negation", position: 0 },
			{ type: "word", value: "hello", position: 1 }
		]);
		expect(result.ast).toEqual({ type: "condition", token: "word", value: "hello", negated: true, position: 1 });
	});

	it("parses logical operators AND/OR", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("foo AND bar OR baz");
		expect(result.tokens).toEqual([
			{ type: "word", value: "foo", position: 0 },
			{ type: "operator", value: "AND", position: 4 },
			{ type: "word", value: "bar", position: 8 },
			{ type: "operator", value: "OR", position: 12 },
			{ type: "word", value: "baz", position: 15 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "OR",
			left: {
				type: "binary",
				operator: "AND",
				left: { type: "condition", token: "word", value: "foo", position: 0 },
				right: { type: "condition", token: "word", value: "bar", position: 8 }
			},
			right: { type: "condition", token: "word", value: "baz", position: 15 }
		});
	});

	it("parses grouping with parentheses", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("(foo OR bar) AND baz");
		expect(result.tokens).toMatchObject([
			{ type: "open_paren", negated: false, position: 0 },
			{ type: "word", value: "foo", position: 1 },
			{ type: "operator", value: "OR", position: 5 },
			{ type: "word", value: "bar", position: 8 },
			{ type: "close_paren", position: 11 },
			{ type: "operator", value: "AND", position: 13 },
			{ type: "word", value: "baz", position: 17 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: {
				type: "binary",
				operator: "OR",
				left: { type: "condition", token: "word", value: "foo", position: 1 },
				right: { type: "condition", token: "word", value: "bar", position: 8 }
			},
			right: { type: "condition", token: "word", value: "baz", position: 17 }
		});
	});

	it("parses numeric operators", () => {
		const parser = new QueryParser({ validKeys: ["age"] });
		const result = parser["parse"]("age<20 OR age=25 OR age>30");
		expect(result.tokens).toEqual([
			{ type: "keyword_numeric", key: "age", operator: "<", value: 20, position: 0 },
			{ type: "operator", value: "OR", position: 7 },
			{ type: "keyword_numeric", key: "age", operator: "=", value: 25, position: 10 },
			{ type: "operator", value: "OR", position: 17 },
			{ type: "keyword_numeric", key: "age", operator: ">", value: 30, position: 20 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "OR",
			left: {
				type: "binary",
				operator: "OR",
				left: { type: "condition", token: "keyword_numeric", key: "age", operator: "<", value: 20, position: 0 },
				right: { type: "condition", token: "keyword_numeric", key: "age", operator: "=", value: 25, position: 10 }
			},
			right: { type: "condition", token: "keyword_numeric", key: "age", operator: ">", value: 30, position: 20 }
		});
	});

	it("parses date operators", () => {
		const parser = new QueryParser({ validKeys: ["created"] });

		// Full Date
		let result = parser["parse"]("created<2025-05-05 OR created=2025-05-10 OR created>2025-05-15");
		expect(result.tokens).toEqual([
			{ type: "keyword_date", key: "created", operator: "<", value: new Date("2025-05-05T00:00:00.000Z"), position: 0 },
			{ type: "operator", value: "OR", position: 19 },
			{ type: "open_paren", position: 22 },
			{ type: "keyword_date", key: "created", operator: ">=", value: new Date("2025-05-10T00:00:00.000Z"), position: 22 },
			{ type: "keyword_date", key: "created", operator: "<=", value: new Date("2025-05-10T23:59:59.999Z"), position: 22 },
			{ type: "close_paren", position: 22 },
			{ type: "operator", value: "OR", position: 41 },
			{ type: "keyword_date", key: "created", operator: ">", value: new Date("2025-05-15T23:59:59.999Z"), position: 44 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "OR",
			left: {
				type: "binary",
				operator: "OR",
				left: {
					type: "condition",
					token: "keyword_date",
					key: "created",
					value: new Date("2025-05-05"),
					operator: "<",
					position: 0
				},
				right: {
					type: "binary",
					operator: "AND",
					left: {
						type: "condition",
						token: "keyword_date",
						key: "created",
						value: new Date("2025-05-10T00:00:00.000Z"),
						operator: ">=",
						position: 22
					},
					right: {
						type: "condition",
						token: "keyword_date",
						key: "created",
						value: new Date("2025-05-10T23:59:59.999Z"),
						operator: "<=",
						position: 22
					}
				}
			},
			right: {
				type: "condition",
				token: "keyword_date",
				key: "created",
				value: new Date("2025-05-15T23:59:59.999Z"),
				operator: ">",
				position: 44
			}
		});

		// Date with time
		result = parser["parse"]("created=2025-05-05 12:00");
		expect(result.tokens).toEqual([{ type: "keyword_date", key: "created", value: new Date("2025-05-05 12:00"), operator: "=", position: 0 }]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_date",
			key: "created",
			value: new Date("2025-05-05 12:00"),
			operator: "=",
			position: 0
		});

		// Month
		result = parser["parse"]("created<2025-05");
		expect(result.tokens).toEqual([
			{
				type: "keyword_date",
				key: "created",
				value: new Date("2025-05"),
				operator: "<",
				position: 0
			}
		]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_date",
			key: "created",
			value: new Date("2025-05"),
			operator: "<",
			position: 0
		});

		result = parser["parse"]("created=2025-05");
		expect(result.tokens).toEqual([
			{ type: "open_paren", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-31T23:59:59.999Z"), operator: "<=", position: 0 },
			{ type: "close_paren", position: 0 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=", position: 0 },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-31T23:59:59.999Z"), operator: "<=", position: 0 }
		});

		// Year
		result = parser["parse"]("created<2025");
		expect(result.tokens).toEqual([
			{
				type: "keyword_date",
				key: "created",
				value: new Date("2025"),
				operator: "<",
				position: 0
			}
		]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_date",
			key: "created",
			value: new Date("2025"),
			operator: "<",
			position: 0
		});

		result = parser["parse"]("created=2025");
		expect(result.tokens).toEqual([
			{ type: "open_paren", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-12-31T23:59:59.999Z"), operator: "<=", position: 0 },
			{ type: "close_paren", position: 0 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=", position: 0 },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-12-31T23:59:59.999Z"), operator: "<=", position: 0 }
		});
	});

	it("parses date range queries", () => {
		// Full Date
		const parser = new QueryParser({ validKeys: ["created"] });
		let result = parser["parse"]("created:2025-05-05..2025-05-10");
		expect(result.tokens).toEqual([
			{ type: "open_paren", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-05T00:00:00.000Z"), operator: ">=", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-10T23:59:59.999Z"), operator: "<=", position: 0 },
			{ type: "close_paren", position: 0 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-05T00:00:00.000Z"), operator: ">=", position: 0 },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-10T23:59:59.999Z"), operator: "<=", position: 0 }
		});

		// Date with time
		result = parser["parse"]("created:2025-05-05 12:00..2025-05-10 12:00");
		expect(result.tokens).toEqual([
			{ type: "open_paren", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-05 12:00"), operator: ">=", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-10 12:00"), operator: "<=", position: 0 },
			{ type: "close_paren", position: 0 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-05 12:00"), operator: ">=", position: 0 },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-10 12:00"), operator: "<=", position: 0 }
		});

		// Month
		result = parser["parse"]("created:2025-05..2025-07");
		expect(result.tokens).toEqual([
			{ type: "open_paren", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-07-31T23:59:59.999Z"), operator: "<=", position: 0 },
			{ type: "close_paren", position: 0 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=", position: 0 },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-07-31T23:59:59.999Z"), operator: "<=", position: 0 }
		});

		// Year
		result = parser["parse"]("created:2025..2026");
		expect(result.tokens).toEqual([
			{ type: "open_paren", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=", position: 0 },
			{ type: "keyword_date", key: "created", value: new Date("2026-12-31T23:59:59.999Z"), operator: "<=", position: 0 },
			{ type: "close_paren", position: 0 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=", position: 0 },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2026-12-31T23:59:59.999Z"), operator: "<=", position: 0 }
		});

		// Negated date range
		result = parser["parse"]("-created=2025..2026");
		expect(result.tokens).toEqual([
			{ type: "open_paren", negated: true, position: 1 },
			{ type: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=", position: 1 },
			{ type: "keyword_date", key: "created", value: new Date("2026-12-31T23:59:59.999Z"), operator: "<=", position: 1 },
			{ type: "close_paren", position: 1 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=", position: 1 },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2026-12-31T23:59:59.999Z"), operator: "<=", position: 1 },
			negated: true
		});
	});

	it("parses numeric range queries", () => {
		const parser = new QueryParser({ validKeys: ["age"] });
		const result = parser["parse"]("age:10..20");
		expect(result.tokens).toEqual([
			{ type: "keyword_numeric", key: "age", operator: ">=", value: 10, position: 0 },
			{ type: "keyword_numeric", key: "age", operator: "<=", value: 20, position: 0 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_numeric", key: "age", operator: ">=", value: 10, position: 0 },
			right: { type: "condition", token: "keyword_numeric", key: "age", operator: "<=", value: 20, position: 0 }
		});
	});

	it("parses regex queries", () => {
		const parser = new QueryParser({ validKeys: ["author"] });

		// Field-specific regex
		let result = parser["parse"]("author:/Tolk.*/");
		expect(result.tokens).toEqual([{ type: "keyword_regex", key: "author", value: "Tolk.*", position: 0 }]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_regex",
			key: "author",
			value: "Tolk.*",
			position: 0
		});

		// Standalone regex
		result = parser["parse"]("/Tolk.*/");
		expect(result.tokens).toEqual([{ type: "regex", value: "Tolk.*", position: 0 }]);
		expect(result.ast).toEqual({ type: "condition", token: "regex", value: "Tolk.*", position: 0 });
	});

	it("parses defaultKey for word/phrase", () => {
		const parser = new QueryParser({ defaultKey: "title" });
		const result = parser["parse"]('Hobbit "The Lord"');
		expect(result.tokens).toEqual([
			{ type: "keyword", key: "title", value: "Hobbit", position: 0 },
			{ type: "keyword_phrase", key: "title", value: "The Lord", position: 7 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword", key: "title", value: "Hobbit", position: 0 },
			right: { type: "condition", token: "keyword_phrase", key: "title", value: "The Lord", position: 7 }
		});
	});

	it("returns errors for invalid syntax", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("hello~world");
		expect(result.metadata.hasErrors).toBe(true);
		expect(result.metadata.errors).toEqual([{ type: "syntax", message: "Unexpected syntax", position: 5, value: "~world" }]);
	});

	it("returns errors for invalid keys", () => {
		const parser = new QueryParser({ validKeys: ["title"] });
		const result = parser["parse"]("author:Tolkien");
		expect(result.metadata.hasErrors).toBe(true);
		expect(result.metadata.errors).toEqual([{ type: "invalid_key", message: "Invalid key: author", position: 0, key: "author", value: "Tolkien" }]);
	});

	it("handles empty queries", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("");
		expect(result.tokens).toEqual([]);
		expect(result.ast).toBeNull();
		expect(result.astConditions).toEqual([]);
	});

	it("handles whitespace-only queries", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("   ");
		expect(result.tokens).toEqual([]);
		expect(result.ast).toBeNull();
		expect(result.astConditions).toEqual([]);
	});

	it("handles deeply nested parentheses", () => {
		const parser = new QueryParser();
		const query = "((foo or bar) and baz)";
		let result = parser["parse"](query);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: {
				type: "binary",
				operator: "OR",
				left: { type: "condition", token: "word", value: "foo", position: 2 },
				right: { type: "condition", token: "word", value: "bar", position: 9 }
			},
			right: { type: "condition", token: "word", value: "baz", position: 18 }
		});

		result = parser["parse"](`(foo and (bar or baz))`);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "word", value: "foo", position: 1 },
			right: {
				type: "binary",
				operator: "OR",
				left: { type: "condition", token: "word", value: "bar", position: 10 },
				right: { type: "condition", token: "word", value: "baz", position: 17 }
			}
		});
	});
});
