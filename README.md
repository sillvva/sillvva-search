# Introduction

Users often need to specify more nuanced criteria than basic keyword searches, such as searching within specific fields, excluding certain terms, or applying logical operators (AND, OR, NOT). Parsing these types of queries can be tricky. Some websites, like [The Gatherer](https://gatherer.wizards.com/advanced-search) (Magic the Gathering's card database), choose to provide "Advanced Search" forms that provide multiple fields for the user to filter the search results. Others like [Scryfall](https://scryfall.com/docs/syntax) choose to provide a single field that interprets human-readable query strings with a custom syntax into search results.

The latter option is what `QueryParser` was designed to assist with. It addresses this need by providing a programmatic way to interpret human-readable query strings into a structured, easily consumable format. Included is a custom search syntax that features:

> - **Word or phrase matching:** e.g., `ai "deep learning"`
> - **Field-specific searches:** e.g., `author:"John Doe"`
> - **Exclusions:** e.g., `-draft`
> - **Logical operators and grouping:** e.g., `status:published (category:technology OR tag:AI)`
> - **Numerical operators:** e.g., `age>=30` or `created<2025-01-01 12:00`
> - **Range operators:** e.g., `age:20..30` or `created:2025-01..2025-06`
> - **Regular expressions:** e.g., `author:/John (Doe|Smith)/`

By transforming these complex strings into a structured representation like an Abstract Syntax Tree, `QueryParser` simplifies the subsequent steps of building database queries, filtering data, or highlighting search results. This separation of concerns — parsing the query from executing the search — makes your search logic cleaner, more maintainable, and less prone to errors.

While the package includes other classes, such as `JSONSearchParser` and `DrizzleSearchParser`, these are primarily illustrative examples demonstrating how you can integrate `QueryParser` into different search scenarios. The true value and primary focus of `@sillvva/search` is the `QueryParser` class.

## Demo

You can see a demo of [`DrizzleSearchParser`](#the-drizzlesearchparser-class) on [CodeSandbox](https://codesandbox.io/p/devbox/d4d36t?file=%2Flib%2Fsearch%2Fcharacter.ts).

# Table of Contents

- [Installation](#installation)
- [Classes](#classes)
  - [The `QueryParser` Class](#the-queryparser-class)
    - [Class Constructor](#class-constructor)
    - [Syntax Reference](#syntax-reference)
    - [Type Reference](#type-reference)
      - [`Token`](#token)
      - [`ASTNode`](#astnode)
      - [`ASTCondition`](#astcondition)
      - [`ParseError`, `ParseMetadata`, and `ParseResult`](#parseerror-parsemetadata-and-parseresult)
  - [The `JSONSearchParser` Class](#the-jsonsearchparser-class)
  - [The `DrizzleSearchParser` Class](#the-drizzlesearchparser-class)
    - [`DrizzleParseResult`](#drizzleparseresult)

# Installation

Install the package using your preferred package manager:

```sh
npm install @sillvva/search

pnpm add @sillvva/search

bun add @sillvva/search
```

# Classes

## The `QueryParser` Class

This is a base class intended for creating a parser class for more specific use cases. For example, the AST can be parsed into a `where` filter object for a database ORM such as Drizzle. See the [`DrizzleSearchParser`](#the-drizzlesearchparser-class) and [`JSONSearchParser`](#the-jsonsearchparser-class) classes for examples.

```ts
import { QueryParser } from "@sillvva/search";

const query = new QueryParser({ validKeys: ["title", "author"] });
const result = query.parse('author:Tolkien -title:"The Hobbit"');

console.log(result.tokens);
console.log(result.ast);
console.log(result.astConditions);

/**
 * Tokens
 * [
 *   { type: 'keyword', key: 'author', value: 'Tolkien', position: 0 },
 *   { type: 'negation', position: 15 },
 *   { type: 'keyword_phrase', key: 'title', value: 'The Hobbit', position: 16 }
 * ]
 */

/**
 * Abstract Syntax Tree
 * {
 *   type: 'binary',
 *   operator: 'AND',
 *   left: { type: 'condition', token: 'keyword', key: 'author', value: 'Tolkien', position: 0 },
 *   right: { type: 'condition', token: 'keyword_phrase', key: 'title', value: 'The Hobbit', negated: true, position: 16 }
 * }
 */

/**
 * AST Conditions
 * [
 *   { key: 'author', value: 'Tolkien', position: 0, isNegated: false, isRegex: false, isNumeric: false, isDate: false },
 *   { key: 'title', value: 'The Hobbit', position: 16, isNegated: true, isRegex: false, isNumeric: false, isDate: false }
 * ]
 */
```

### Class Constructor

The only parameter is an optional options object with two properties:

- `validKeys` allows you to specify which keys are permitted and all other keys given in the query will be ignored. If not provided, all keys in the query will be passed to the parser function.
- `defaultKey` allows you to define a default key for "word", "phrase", and "regex" tokens as defined in the [syntax reference](#syntax-reference). If not provided, the key for the `ConditionNode` will be `undefined`.

### Syntax Reference

| Syntax                                                   | Description                                                                                                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `word`                                                   | A single word will be parsed as a "word" token with no key. A `defaultKey` can be provided in the class options parameter.                                                                                                              |
| `key:word`                                               | A keyword includes a specific key to associate with the word or phrase. It will be parsed as a "keyword" token.                                                                                                                         |
| `"a phrase"`                                             | This syntax will be parsed as a "phrase" token. It allows you to join multiple words together into one token.                                                                                                                           |
| `key:"a phrase"`                                         | This syntax will be parsed as a "keyword_phrase" token. It combines the properties of the "keyword" and "phrase" tokens.                                                                                                                |
| `/^regex$/`                                              | This syntax will be parsed as a "regex" token. The regular expression between the `/` will be provided as a string and can be converted to a `RegExp` constructor in JS or passed to a SQL statement using supported syntax.            |
| `key:/^regex$/`                                          | This syntax combines the properties of the "keyword" syntax and the "regex" syntax.                                                                                                                                                     |
| `key=10`<br>`key>=2024-01-01`                            | When using numeric operators for numbers or dates, the token will become a "keyword_numeric" or "keyword_date" token with the operator provided. See below<sup>1</sup> for supported date formats.                                      |
| `key:10..20`<br>`key:2024-01-01 00:00..2024-01-15 12:00` | Range queries allow you to specify a range of values. For ranges, use `key:start..end`. The result will be two "keyword_numeric" or "keyword_date" tokens. See below<sup>1</sup> for supported date formats.                            |
| `AND`, `&`, `OR`, `\|`                                   | Use `AND`/`&` to require both conditions, `OR`/`\|` for either condition. Adjacent terms default to `AND`.                                                                                                                              |
| `foo (bar or baz)`                                       | Tokens can be grouped together using parentheses. Groups can also be nested.                                                                                                                                                            |
| `-` and `!`                                              | The negator character can be used to negate any "word", "keyword", or "phrase" token. Example: `-word -"phrase"` or `!word !"phrase"`<br><br>It can also be used to negate a group. Example: `-(word1 OR word2)` or `!(word1 \| word2)` |

<sup>1</sup> The following [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) formats are supported:

- ISO 8601 UTC - `YYYY-MM-DD[T| ]HH:mm(:ss(.sss))(Z)` - Seconds, milliseconds, and time zone are optional
- ISO 8601 with offset - `YYYY-MM-DD[T| ]HH:mm(:ss(.sss))([+|-]HH:mm)` - Seconds, milliseconds, and time zone are optional
- Full date - `YYYY-MM-DD`
- Month - `YYYY-MM`
- Year - `YYYY`

### Type Reference

#### `Token`

The tokens represent the various syntax components detailed above. The protected `parse` method of the [`QueryParser`](#the-queryparser-class), converts the search query string into tokens and then into an `ASTNode` object and an array of `ASTCondition` objects.

```ts
export type LogicalOperator = "AND" | "OR";
export type NumericOperator = "=" | ">" | "<" | ">=" | "<=";

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
```

#### `ASTNode`

The Abstract Syntax Tree is represented by the `ASTNode` type, which is a type that recursively references itself for nested conditions. The `BinaryNode` represents a logical operation (AND/OR) between two nodes. The `ConditionNode` represents a single search condition.

```ts
export type ASTNode = BinaryNode | ConditionNode;

interface BinaryNode {
	type: "binary";
	operator: LogicalOperator;
	left: ASTNode;
	right: ASTNode;
	negated?: boolean;
}

interface ConditionNode {
	type: "condition";
	token: ConditionToken;
	key?: string;
	value: string | number | Date;
	position: number;
	negated?: boolean;
	operator?: NumericOperator;
}
```

#### `ASTCondition`

The `ASTCondition` type is a flattened object representing condition nodes from the Abstract Syntax Tree. In the [DrizzleSearchParser](#the-drizzlesearchparser-class), the parser function you provide uses this type as its only parameter for converting AST nodes into Drizzle-compatible filter objects.

```ts
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
```

#### `ParseError`, `ParseMetadata`, and `ParseResult`

The protected `parse` method returns a `ParseResult` object, which contains the tokens, abstract syntax tree, flattened conditions array, and query metadata. The metadata includes any syntax or invalid key errors from the query.

```ts
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
```

## The `JSONSearchParser` Class

`JSONSearchParser` is a class that extends the [`QueryParser`](#the-queryparser-class) class and provides a filter method that filters and sosrts an array of JSON data using a search query.

```ts
import { JSONSearchParser } from "@sillvva/search/json";

interface Book {
	title: string;
	author: string;
}

const books: Book[] = [
	{ title: "The Hobbit", author: "Tolkien" },
	{ title: "The Lord of the Rings", author: "Tolkien" },
	{ title: "1984", author: "Orwell" }
];

const parser = new JSONSearchParser(books, { validKeys: ["title", "author"], defaultKey: "title" });
const result = parser.filter("author:tolkien -hobbit");
// result: [{ title: "The Lord of the Rings", author: "Tolkien" }]

const result = parser.filter("asc:author asc:title");
// result: [
//   { title: "1984", author: "Orwell" },
//   { title: "The Hobbit", author: "Tolkien" },
//   { title: "The Lord of the Rings", author: "Tolkien" }
// ]
```

## The `DrizzleSearchParser` Class

`DrizzleSearchParser` is a class that extends the [`QueryParser`](#the-queryparser-class) class and provides a parseDrizzle method that parses a search query into a Drizzle-compatible filter object for the [v2 relational query builder](https://rqbv2.drizzle-orm-fe.pages.dev/docs/rqb-v2#select-filters). You can see a demo of this on [CodeSandbox](https://codesandbox.io/p/devbox/d4d36t?file=%2Flib%2Fsearch%2Fcharacter.ts).

The class requires two type parameters:

- The relations from the `defineRelations` function in Drizzle's RQB v2.
- The table name as a string constant type

The constructor takes an options object with four properties:

- Required: `filterFn` parses individual `ASTCondition` objects into Drizzle-compatible filter objects. By providing relations to the class, the return statement will provide autocomplete as if you were building a `findFirst` or `findMany` where object directly. Returning `undefined` will remove the condition from the final where object.
- Optional: `orderFn` parses [`SortCondition`](#drizzleparseresult) objects into Drizzle-compatible `orderBy` objects and merges them together.
- Optional: `validKeys` allows you to specify which keys are permitted and all other keys given in the query will be ignored. If not provided, all keys in the query will be passed to the parser function.
- Optional: `defaultKey` allows you to define a default key for "word", "phrase", and "regex" tokens as defined in the [syntax reference](#syntax-reference). If not provided, the key for the `ConditionNode` will be `undefined`.

The class has three methods:

- The `parseNumeric` and `parseDate` method parses "keyword_numeric" and "keyword_date" conditions and operator to the Drizzle-compatible equivalent.
- The `parse` method returns the [`DrizzleParseResult`](#drizzleparseresult) object detailed below.

```ts
import { DrizzleSearchParser } from "@sillvva/search/drizzle";
import { relations } from "./schema";

const validKeys = ["name", "age"] as const;
const defaultKey = "name" as const satisfies (typeof validKeys)[number];

// Instantiate the parser
const parser = new DrizzleSearchParser<typeof relations, "user">({
	validKeys,
	defaultKey,
	filterFn: (cond) => {
		const key = (cond.key?.toLowerCase() || defaultKey) as (typeof validKeys)[number];
		switch(key) {
			case "name":
				return { name: { ilike: `%${cond.value}%` } };

			case "age":
				const op = parser.parseNumeric(cond);
				return op && { [key]: op };

			default:
				return;
		}
	}
	orderFn: (cond) => {
		const key = (String(cond.value)?.toLowerCase() || defaultKey) as (typeof validKeys)[number];
		switch(key) {
			case "name":
			case "age":
				return { [key]: cond.key === "asc" : "asc" : "desc" };

			default:
				return;
		}
	}
});

// Parse a query string ✅
const { where, orderBy } = parser.parse("name:John age>=30 desc:age");
// where: { AND: [{ name: { ilike: "%John%" } }, { age: { gte: 30 } }] }
// orderBy: { age: "desc" }

// Invalid age ❌
const { where, orderBy } = parser.parse("name:John age:thirty");
// where: { AND: [{ name: { ilike: "%John%" } }] }
// orderBy: undefined

// Usage
const users = await db.query.user.findMany({ where, orderBy });
```

### `DrizzleParseResult`

The `DrizzleParseResult` interface result extends the [`ParseResult`](#parseerror-parsemetadata-and-parseresult) interface including the tokens, Abstract Syntax Tree (AST), and metadata. In addition to the `where` and `orderBy` objects, the `parse` method also returns the conditions used to construct those objects as well as any remaining conditions that were not included in either. The `excluded` conditions can be used for further filtering and sorting after the db results are fetched.

```ts
export interface SortCondition {
	dir: "asc" | "desc";
	key: string;
}

export interface DrizzleParseResult<TFilter extends RelationsFilter<any, any>, TOrder extends RelationsOrder<any>>
	extends Omit<ParseResult, "astConditions"> {
	/**
	 * The Drizzle-compatible where object.
	 */
	where: TFilter | undefined;
	/**
	 * The Drizzle-compatible orderBy object.
	 */
	orderBy: TOrder | undefined;
	/**
	 * Conditions that were included and excluded from the Drizzle-compatible where and orderBy objects.
	 */
	conditions: {
		/**
		 * Conditions that were included in the Drizzle-compatible where object.
		 */
		filtered: ASTCondition[];
		/**
		 * Conditions that were included in the Drizzle-compatible orderBy object.
		 */
		sorted: SortCondition[];
		/**
		 * Conditions that were excluded from the Drizzle-compatible where and orderBy objects.
		 */
		excluded: ASTCondition[];
	};
}
```
