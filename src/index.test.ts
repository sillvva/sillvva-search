import { QueryParser } from "./index";

describe("QueryParser", () => {
	it("parses simple word queries", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("hello");
		expect(result.tokens).toEqual([{ type: "word", value: "hello" }]);
		expect(result.ast).toEqual({ type: "condition", token: "word", value: "hello" });
	});

	it("parses phrase queries", () => {
		const parser = new QueryParser();
		const result = parser["parse"]('"hello world"');
		expect(result.tokens).toEqual([{ type: "phrase", value: "hello world" }]);
		expect(result.ast).toEqual({ type: "condition", token: "phrase", value: "hello world" });
	});

	it("parses field-specific queries", () => {
		const parser = new QueryParser({ validKeys: ["author", "title"] });
		const result = parser["parse"](`author:Tolkien title:"The Hobbit"`);
		expect(result.tokens).toEqual([
			{ type: "keyword", key: "author", value: "Tolkien" },
			{ type: "keyword_phrase", key: "title", value: "The Hobbit" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword", key: "author", value: "Tolkien" },
			right: { type: "condition", token: "keyword_phrase", key: "title", value: "The Hobbit" }
		});
	});

	it("parses exclusions (negation)", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("-hello");
		expect(result.tokens).toEqual([{ type: "negation" }, { type: "word", value: "hello" }]);
		expect(result.ast).toEqual({ type: "condition", token: "word", value: "hello", negated: true });
	});

	it("parses logical operators AND/OR", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("foo AND bar OR baz");
		expect(result.tokens).toEqual([
			{ type: "word", value: "foo" },
			{ type: "operator", value: "AND" },
			{ type: "word", value: "bar" },
			{ type: "operator", value: "OR" },
			{ type: "word", value: "baz" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "OR",
			left: {
				type: "binary",
				operator: "AND",
				left: { type: "condition", token: "word", value: "foo" },
				right: { type: "condition", token: "word", value: "bar" }
			},
			right: { type: "condition", token: "word", value: "baz" }
		});
	});

	it("parses grouping with parentheses", () => {
		const parser = new QueryParser();
		const result = parser["parse"]("(foo OR bar) AND baz");
		expect(result.tokens).toMatchObject([
			{ type: "open_paren" },
			{ type: "word", value: "foo" },
			{ type: "operator", value: "OR" },
			{ type: "word", value: "bar" },
			{ type: "close_paren" },
			{ type: "operator", value: "AND" },
			{ type: "word", value: "baz" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: {
				type: "binary",
				operator: "OR",
				left: { type: "condition", token: "word", value: "foo" },
				right: { type: "condition", token: "word", value: "bar" }
			},
			right: { type: "condition", token: "word", value: "baz" }
		});
	});

	it("parses numeric operators", () => {
		const parser = new QueryParser({ validKeys: ["age"] });
		const result = parser["parse"]("age<20 OR age=25 OR age>30");
		expect(result.tokens).toEqual([
			{ type: "keyword_numeric", key: "age", operator: "<", value: 20 },
			{ type: "operator", value: "OR" },
			{ type: "keyword_numeric", key: "age", operator: "=", value: 25 },
			{ type: "operator", value: "OR" },
			{ type: "keyword_numeric", key: "age", operator: ">", value: 30 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "OR",
			left: {
				type: "binary",
				operator: "OR",
				left: { type: "condition", token: "keyword_numeric", key: "age", operator: "<", value: 20 },
				right: { type: "condition", token: "keyword_numeric", key: "age", operator: "=", value: 25 }
			},
			right: { type: "condition", token: "keyword_numeric", key: "age", operator: ">", value: 30 }
		});
	});

	it("parses date operators", () => {
		const parser = new QueryParser({ validKeys: ["created"] });

		// Full Date
		let result = parser["parse"]("created<2025-05-05 OR created=2025-05-10 OR created>2025-05-15");
		expect(result.tokens).toEqual([
			{ type: "keyword_date", key: "created", value: new Date("2025-05-05"), operator: "<" },
			{ type: "operator", value: "OR" },
			{ type: "open_paren" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-10T00:00:00.000Z"), operator: ">=" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-10T23:59:59.999Z"), operator: "<=" },
			{ type: "close_paren" },
			{ type: "operator", value: "OR" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-15T23:59:59.999Z"), operator: ">" }
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
					operator: "<"
				},
				right: {
					type: "binary",
					operator: "AND",
					left: {
						type: "condition",
						token: "keyword_date",
						key: "created",
						value: new Date("2025-05-10T00:00:00.000Z"),
						operator: ">="
					},
					right: {
						type: "condition",
						token: "keyword_date",
						key: "created",
						value: new Date("2025-05-10T23:59:59.999Z"),
						operator: "<="
					}
				}
			},
			right: {
				type: "condition",
				token: "keyword_date",
				key: "created",
				value: new Date("2025-05-15T23:59:59.999Z"),
				operator: ">"
			}
		});

		// Date with time
		result = parser["parse"]("created=2025-05-05 12:00");
		expect(result.tokens).toEqual([{ type: "keyword_date", key: "created", value: new Date("2025-05-05 12:00"), operator: "=" }]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_date",
			key: "created",
			value: new Date("2025-05-05 12:00"),
			operator: "="
		});

		// Month
		result = parser["parse"]("created<2025-05");
		expect(result.tokens).toEqual([
			{
				type: "keyword_date",
				key: "created",
				value: new Date("2025-05"),
				operator: "<"
			}
		]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_date",
			key: "created",
			value: new Date("2025-05"),
			operator: "<"
		});

		result = parser["parse"]("created=2025-05");
		expect(result.tokens).toEqual([
			{ type: "open_paren" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-31T23:59:59.999Z"), operator: "<=" },
			{ type: "close_paren" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=" },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-31T23:59:59.999Z"), operator: "<=" }
		});

		// Year
		result = parser["parse"]("created<2025");
		expect(result.tokens).toEqual([
			{
				type: "keyword_date",
				key: "created",
				value: new Date("2025"),
				operator: "<"
			}
		]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_date",
			key: "created",
			value: new Date("2025"),
			operator: "<"
		});

		result = parser["parse"]("created=2025");
		expect(result.tokens).toEqual([
			{ type: "open_paren" },
			{ type: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=" },
			{ type: "keyword_date", key: "created", value: new Date("2025-12-31T23:59:59.999Z"), operator: "<=" },
			{ type: "close_paren" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=" },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-12-31T23:59:59.999Z"), operator: "<=" }
		});
	});

	it("parses date range queries", () => {
		// Full Date
		const parser = new QueryParser({ validKeys: ["created"] });
		let result = parser["parse"]("created:2025-05-05..2025-05-10");
		expect(result.tokens).toEqual([
			{ type: "open_paren" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-05T00:00:00.000Z"), operator: ">=" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-10T23:59:59.999Z"), operator: "<=" },
			{ type: "close_paren" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-05T00:00:00.000Z"), operator: ">=" },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-10T23:59:59.999Z"), operator: "<=" }
		});

		// Date with time
		result = parser["parse"]("created:2025-05-05 12:00..2025-05-10 12:00");
		expect(result.tokens).toEqual([
			{ type: "open_paren" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-05 12:00"), operator: ">=" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-10 12:00"), operator: "<=" },
			{ type: "close_paren" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-05 12:00"), operator: ">=" },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-10 12:00"), operator: "<=" }
		});

		// Month
		result = parser["parse"]("created:2025-05..2025-07");
		expect(result.tokens).toEqual([
			{ type: "open_paren" },
			{ type: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=" },
			{ type: "keyword_date", key: "created", value: new Date("2025-07-31T23:59:59.999Z"), operator: "<=" },
			{ type: "close_paren" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-05-01T00:00:00.000Z"), operator: ">=" },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-07-31T23:59:59.999Z"), operator: "<=" }
		});

		// Year
		result = parser["parse"]("created:2025..2026");
		expect(result.tokens).toEqual([
			{ type: "open_paren" },
			{ type: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=" },
			{ type: "keyword_date", key: "created", value: new Date("2026-12-31T23:59:59.999Z"), operator: "<=" },
			{ type: "close_paren" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_date", key: "created", value: new Date("2025-01-01T00:00:00.000Z"), operator: ">=" },
			right: { type: "condition", token: "keyword_date", key: "created", value: new Date("2026-12-31T23:59:59.999Z"), operator: "<=" }
		});
	});

	it("parses numeric range queries", () => {
		const parser = new QueryParser({ validKeys: ["age"] });
		const result = parser["parse"]("age:10..20");
		expect(result.tokens).toEqual([
			{ type: "keyword_numeric", key: "age", operator: ">=", value: 10 },
			{ type: "keyword_numeric", key: "age", operator: "<=", value: 20 }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword_numeric", key: "age", operator: ">=", value: 10 },
			right: { type: "condition", token: "keyword_numeric", key: "age", operator: "<=", value: 20 }
		});
	});

	it("parses regex queries", () => {
		const parser = new QueryParser({ validKeys: ["author"] });
		const result = parser["parse"]("author:/Tolk.*/");
		expect(result.tokens).toEqual([{ type: "keyword_regex", key: "author", value: "Tolk.*" }]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_regex",
			key: "author",
			value: "Tolk.*"
		});
	});

	it("parses defaultKey for word/phrase", () => {
		const parser = new QueryParser({ defaultKey: "title" });
		const result = parser["parse"]('Hobbit "The Lord"');
		expect(result.tokens).toEqual([
			{ type: "keyword", key: "title", value: "Hobbit" },
			{ type: "keyword_phrase", key: "title", value: "The Lord" }
		]);
		expect(result.ast).toEqual({
			type: "binary",
			operator: "AND",
			left: { type: "condition", token: "keyword", key: "title", value: "Hobbit" },
			right: { type: "condition", token: "keyword_phrase", key: "title", value: "The Lord" }
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
});
