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
		const parser = new QueryParser({ validKeys: ["author"] });
		const result = parser["parse"]("author:Tolkien");
		expect(result.tokens).toEqual([{ type: "keyword", key: "author", value: "Tolkien" }]);
		expect(result.ast).toEqual({ type: "condition", token: "keyword", key: "author", value: "Tolkien" });
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
		const result = parser["parse"]("age>=30");
		expect(result.tokens).toEqual([{ type: "keyword_numeric", key: "age", operator: ">=", value: 30 }]);
		expect(result.ast).toEqual({
			type: "condition",
			token: "keyword_numeric",
			key: "age",
			value: 30,
			operator: ">="
		});
	});

	it("parses date operators", () => {
		const parser = new QueryParser({ validKeys: ["created"] });
		const result = parser["parse"]("created<2025-01-01");
		const token = result.tokens[0];
		expect(token).toBeDefined();
		if (token && token.type === "keyword_date") {
			expect(token.value instanceof Date).toBe(true);
			expect(token.value.toISOString()).toBe("2025-01-01T00:00:00.000Z");
		}
		expect(token).toMatchObject({
			type: "keyword_date",
			key: "created",
			operator: "<"
		});
		expect(result.ast).toMatchObject({
			type: "condition",
			token: "keyword_date",
			key: "created",
			operator: "<"
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
});
