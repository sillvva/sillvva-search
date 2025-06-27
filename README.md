# Introduction

This package provides a solution for implementing advanced search functionalities within your applications. At its core is the `AdvancedSearchParser` class, a powerful class built to parse complex search queries into a structured, easily consumable format.

Users often need to specify more nuanced criteria than basic keyword seaches, such as searching within specific fields, excluding certain terms, or applying logical operators (AND, OR, NOT). Parsing these types of queries can be tricky. Some websites, like [The Gatherer](https://gatherer.wizards.com/advanced-search) (Magic the Gathering's card database), choose to provide "Advanced Search" forms that provide multiple fields for the user to filter the search results. Others like [Scryfall](https://scryfall.com/docs/syntax) choose to provide a single field that interprets human-readable query strings with custom syntax into actual search results.

The latter option is what `AdvancedSearchParser` was designed to do. It addresses this need by providing a programmatic way to interpret human-readable query strings. Included is a custom search syntax that features:

> - **Phrase matching:** e.g., `title:"deep learning"`
> - **Field-specific searches:** e.g., `author:"John Doe"`
> - **Exclusions:** e.g., `-"draft"`
> - **Logical operators and grouping:** e.g., `(status:published AND category:technology) OR tag:AI`
> - **Numerical operators:** e.g., `age>=30`
> - **Regular expressions:** e.g., `author:/John (Doe|Smith)/`

By transforming these complex strings into a structured representation like an Abstract Syntax Tree, `AdvancedSearchParser` simplifies the subsequent steps of building database queries, filtering data, or highlighting search results. This separation of concerns — parsing the query from executing the search — makes your search logic cleaner, more maintainable, and less prone to errors.

While the package includes other classes, such as `JSONSearchParser` and `DrizzleSearchParser`, these are primarily illustrative examples demonstrating how you can integrate `AdvancedSearchParser` into different search scenarios. The true value and primary focus of `@sillvva/search` is the `AdvancedSearchParser` class.

# Table of Contents
- [Installation](#installation)
- [Classes](#classes)
	- [The `AdvancedSearchParser` Class](#the-advancedsearchparser-class)
		- [Syntax Reference](#syntax-reference)
		- [Type Reference](#type-reference)
			- [`type Token`](#type-token)
			- [`type ASTNode`](#type-astnode)
			- [`interface ASTCondition`](#interface-astcondition)
	- [The `JSONSearchParser` Class](#the-jsonsearchparser-class)
	- [The `DrizzleSearchParser` Class](#the-drizzlesearchparser-class)
- [Roadmap](#roadmap)

# Installation

Install the package using your preferred package manager:

```sh
npm install @sillvva/search

pnpm add @sillvva/search

bun add @sillvva/search
```

# Classes

## The `AdvancedSearchParser` Class

This is a base class intended for creating a parser class for more specific use cases. For example, the AST can be parsed into a `where` filter object for a database ORM such as Drizzle. See the [`DrizzleSearchParser`](#the-drizzlesearchparser-class) and [`JSONSearchParser`](#the-jsonsearchparser-class) classes for examples.

```ts
import { AdvancedSearchParser } from "@sillvva/search";

const query = new AdvancedSearchParser({ validKeys: ["title", "author"] });
const result = query.parse('author:Tolkien -title:"The Hobbit"');

console.log(result.tokens);
console.log(result.ast);
console.log(result.astConditions);

/** 
 * Tokens
 * [
 *   { type: 'keyword', key: 'author', value: 'Tolkien' },
 *   { type: 'negation' },
 *   { type: 'keyword_phrase', key: 'title', value: 'The Hobbit' }
 * ]
 */

/** 
 * Abstract Syntax Tree
 * {
 *   type: 'binary',
 *   operator: 'AND',
 *   left: { type: 'condition', token: 'keyword', key: 'author', value: 'Tolkien' },
 *   right: { type: 'condition', token: 'keyword_phrase', key: 'title', value: 'The Hobbit', negated: true }
 * }
 */

/**
 * AST Conditions
 * [
 *   { key: 'author', value: 'Tolkien', isRegex: false, isNegated: false, isNumeric: false },
 *   { key: 'title', value: 'The Hobbit', isRegex: false, isNegated: true, isNumeric: false }
 * ]
 */
```

### Syntax Reference

| Syntax                                                     | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `word` | A single word will be parsed as a "word" token with no key. A `defaultKey` can be provided in the class options parameter. |
| `key:word` | A keyword includes a specific key to associate with the word or phrase. It will be parsed as a "keyword" token. |
| `"a phrase"` | This syntax will be parsed as a "phrase" token. It allows you to join multiple words together into one token. |
| `key:"a phrase"` | This syntax will be parsed as a "keyword_phrase" token. It combines the properties of the "keyword" and "phrase" tokens. |
| `/^regex$/` | This syntax will be parsed as a "regex" token. The regular expression between the `/` will be provided as a string and can be converted to a `RegExp` object in JS or passed to a SQL statement using supported syntax. |
| `key:/^regex$/` | This syntax combines the properties of the "keyword" syntax and the "regex" syntax. |
| `key=10`<br>`key<=10`<br>`key<10`<br>`key>10`<br>`key>=10` | When using numeric operators and numbers, the token will be treated as numeric an become a "keyword_numeric" token with the operator provided. |
| `AND` and `OR` | You can use `AND` and `OR` operators between tokens. When no provider is specified, `AND` is implied. |
| `(...)` | Tokens can be grouped together using round brackets (parentheses). Groups can also be nested. |
| `-` | The negator character (dash or minus) can be used to negate a "word", "keyword", "phrase", "keyword_phrase", "regex", or "keyword_regex" token. Example: `-word -"phrase"`<br><br>It can also be used to negate a group. Example: `-(word1 OR word2)` |

### Type Reference

#### `type Token`

The tokens represent the various syntax components detailed above. The protected `parse` method of the [`AdvancedSearchParser`](#the-advancedsearchparser-class), converts the search query string into tokens and then into an `ASTNode` object and an array of `ASTCondition` objects.

```ts
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
	| { type: "word"; value: string }
	| { type: "phrase"; value: string }
	| { type: "regex"; value: string }
	| { type: "operator"; value: LogicalOperator }
	| { type: "open_paren"; negated?: boolean }
	| { type: "close_paren" }
	| { type: "negation" };
```

#### `type ASTNode`

The Abstract Syntax Tree is represented by the `ASTNode` type, which is a type that recursively references itself for nested conditions.

```ts
/**
 * Represents a node in the Abstract Syntax Tree (AST) for a search query.
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
	value: string | number;
	negated?: boolean;
	operator?: NumericOperator;
}
```

#### `interface ASTCondition`

The `ASTCondition` type is a flattened object representing condition nodes from the Abstract Syntax Tree. In the [DrizzleSearchParser](#the-drizzlesearchparser-class), the parser function you provide uses this type as its only parameter for converting AST nodes into Drizzle-compatible filter objects.

```ts
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
```

## The `JSONSearchParser` Class

`JSONSearchParser` is a class that extends the [`AdvancedSearchParser`](#the-advancedsearchparser-class) class and provides a filter method that filters an array of JSON data using a search query.

```ts
const query = new JSONSearchParser(books, { validKeys: ["title", "author"] });
const filteredBooks = query.filter('author:Tolkien -title:"The Hobbit"');
```

## The `DrizzleSearchParser` Class

`DrizzleSearchParser` is a class that extends the [`AdvancedSearchParser`](#the-advancedsearchparser-class) class and provides a parseDrizzle method that parses a search query into a Drizzle-compatible filter object for the v2 relational query builder. You can see a demo of this on [CodeSandbox](https://codesandbox.io/p/devbox/4894v5?file=%2Flib%2Fsearch%2Fcharacter.ts%3A63%2C9).

The class requires two type parameters:
- The relations from the `defineRelations` function in Drizzle's RQB v2.
- The table name as a string constant type

The constructor takes two parameters:
- A function that parses individual `ASTCondition` objects into Drizzle-compatible filter objects. By providing relations to the class, the return statement will provide autocomplete as if you were building a `findFirst` or `findMany` where object directly. Returning `undefined` will remove the condition from the final where object.
- An options object with two properties:
	- `validKeys` allows you to specify which keys are permitted and all other keys given in the query will be ignored. If not provided, all keys in the query will be passed to the parser function.
	- `defaultKey` allows you to define a default key for "word" tokens as defined in the [syntax reference](#syntax-reference).

The `parseDrizzle` method returns the `tokens`, Abstract Syntax Tree (`ast`), the AST conditions (`astConditions`), and the `where` object.

```ts
import { DrizzleSearchParser } from "@sillvva/search/drizzle";
import { relations } from "./schema";

// Instantiate the parser
const parser = new DrizzleSearchParser<typeof relations, "user">((cond) => {
  if (cond.key === "name") {
    return { name: { ilike: `%${cond.value}%` } };
  }
  if (cond.key === "age") {
    const op = parser.parseNumeric(cond);
    return op && { age: op };
  }
  return undefined;
}, { validKeys: ["name", "age"] });

// Parse a query string ✅
const { where } = parser.parseDrizzle("name:John AND age>=30");
// where: { AND: [{ name: { ilike: "%John%" } }, { age: { gte: 30 } }] }

// Invalid age ❌
const { where } = parser.parseDrizzle("name:John age:thirty");
// where: { AND: [{ name: { ilike: "%John%" } }] }

// Usage
const users = await db.query.user.findMany({ where });
```

# Roadmap

In the future I plan to experiment with to possibly add some of the following features:

> Coming soon