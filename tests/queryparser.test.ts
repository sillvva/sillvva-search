
import { 
  QueryParser, 
  type ParseResult,
} from '../src';

// Test class to expose protected _parse method
class TestQueryParser extends QueryParser {
  public parse(query: string): ParseResult {
    return this._parse(query);
  }
}

describe('QueryParser', () => {
  let parser: TestQueryParser;

  beforeEach(() => {
    parser = new TestQueryParser();
  });

  describe('Basic Tokenization', () => {
    it('should parse simple words', () => {
      const result = parser.parse('hello world');
      
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]).toMatchObject({
        type: 'word',
        value: 'hello',
        position: 0
      });
      expect(result.tokens[1]).toMatchObject({
        type: 'word',
        value: 'world',
        position: 6
      });
    });

    it('should parse phrases in quotes', () => {
      const result = parser.parse('"hello world"');
      
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        type: 'phrase',
        value: 'hello world',
        position: 0
      });
    });

    it('should parse regular expressions', () => {
      const result = parser.parse('/test.*/');
      
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        type: 'regex',
        value: 'test.*',
        position: 0
      });
    });
  });

  describe('Keywords', () => {
    it('should parse keyword-value pairs', () => {
      const result = parser.parse('author:Tolkien');
      
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword',
        key: 'author',
        value: 'Tolkien',
        position: 0
      });
    });

    it('should parse keyword phrases', () => {
      const result = parser.parse('title:"The Hobbit"');
      
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_phrase',
        key: 'title',
        value: 'The Hobbit',
        position: 0
      });
    });

    it('should parse keyword regex', () => {
      const result = parser.parse('name:/test.*/');
      
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_regex',
        key: 'name',
        value: 'test.*',
        position: 0
      });
    });
  });

  describe('Logical Operators', () => {
    it('should parse AND operator', () => {
      const result = parser.parse('hello AND world');
      
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[1]).toMatchObject({
        type: 'operator',
        value: 'AND',
        position: 6
      });
    });

    it('should parse OR operator', () => {
      const result = parser.parse('hello OR world');
      
      expect(result.tokens[1]).toMatchObject({
        type: 'operator',
        value: 'OR',
        position: 6
      });
    });

    it('should parse symbolic operators', () => {
      const result = parser.parse('hello & world | test');
      
      // Find the operator tokens in the result
      const operatorTokens = result.tokens.filter(t => t.type === 'operator');
      expect(operatorTokens).toHaveLength(2);
      expect(operatorTokens[0]).toMatchObject({
        type: 'operator',
        value: '&'
      });
      expect(operatorTokens[1]).toMatchObject({
        type: 'operator',
        value: '|'
      });
    });

    it('should default to AND for adjacent terms', () => {
      const result = parser.parse('hello world');
      
      expect(result.ast).toMatchObject({
        type: 'binary',
        operator: 'AND',
        left: { type: 'condition', token: 'word', value: 'hello' },
        right: { type: 'condition', token: 'word', value: 'world' }
      });
    });
  });

  describe('Negation', () => {
    it('should parse negation with dash', () => {
      const result = parser.parse('-hello');
      
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]).toMatchObject({
        type: 'negation'
      });
      expect(result.tokens[1]).toMatchObject({
        type: 'word',
        value: 'hello'
      });
      expect(result.ast?.negated).toBe(true);
    });

    it('should parse negation with exclamation', () => {
      const result = parser.parse('!hello');
      
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]).toMatchObject({
        type: 'negation'
      });
      expect(result.tokens[1]).toMatchObject({
        type: 'word',
        value: 'hello'
      });
      expect(result.ast?.negated).toBe(true);
    });

    it('should parse negated keywords', () => {
      const result = parser.parse('-author:Tolkien');
      
      expect(result.astConditions[0]?.isNegated).toBe(true);
    });

    it('should parse negated phrases', () => {
      const result = parser.parse('-"hello world"');
      
      expect(result.astConditions[0]?.isNegated).toBe(true);
    });
  });

  describe('Parentheses and Grouping', () => {
    it('should parse simple parentheses', () => {
      const result = parser.parse('(hello world)');
      
      expect(result.tokens).toContainEqual(
        expect.objectContaining({ type: 'open_paren' })
      );
      expect(result.tokens).toContainEqual(
        expect.objectContaining({ type: 'close_paren' })
      );
    });

    it('should parse negated parentheses', () => {
      const result = parser.parse('-(hello world)');
      
      expect(result.tokens[0]).toMatchObject({
        type: 'open_paren',
        negated: true
      });
    });

    it('should handle complex grouping', () => {
      const result = parser.parse('(author:Tolkien OR author:Lewis) AND title:book');
      
      expect(result.ast?.type).toBe('binary');
      expect(result.ast?.operator).toBe('AND');
    });
  });

  describe('Numeric Operations', () => {
    it('should parse numeric equality', () => {
      const result = parser.parse('price:100');
      
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_numeric',
        key: 'price',
        operator: '=',
        value: 100
      });
    });

    it('should parse numeric comparisons', () => {
      const testCases = [
        { query: 'price>100', operator: '>' },
        { query: 'price<100', operator: '<' },
        { query: 'price>=100', operator: '>=' },
        { query: 'price<=100', operator: '<=' },
      ];

      testCases.forEach(({ query, operator }) => {
        const result = parser.parse(query);
        expect(result.tokens[0]).toMatchObject({
          type: 'keyword_numeric',
          operator,
          value: 100
        });
      });
    });

    it('should parse decimal numbers', () => {
      const result = parser.parse('price:99.99');
      
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_numeric',
        value: 99.99
      });
    });

    it('should parse negative numbers', () => {
      const result = parser.parse('temperature:-10');
      
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_numeric',
        value: -10
      });
    });
  });

  describe('Date Operations', () => {
    it('should parse ISO date strings', () => {
      const result = parser.parse('created:2024-01-15');
      
      expect(result.tokens).toHaveLength(4); // open_paren, date>=, date<=, close_paren get added
      expect(result.tokens[1]).toMatchObject({
        type: 'keyword_date',
        key: 'created',
        operator: '>='
      });
      expect(result.tokens[2]).toMatchObject({
        type: 'keyword_date',
        key: 'created',
        operator: '<='
      });
    });

    it('should parse date with time', () => {
      const result = parser.parse('created:2024-01-15T10:30:00Z');
      
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_date',
        key: 'created',
        operator: '='
      });
    });

    it('should parse date comparisons', () => {
      const result = parser.parse('created>=2024-01-01');
      
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_date',
        operator: '>=',
        key: 'created'
      });
    });

    it('should parse month-only dates', () => {
      const result = parser.parse('created:2024-01');
      
      expect(result.tokens).toHaveLength(4); // Gets expanded to range
      expect(result.tokens[1]).toMatchObject({
        type: 'keyword_date',
        operator: '>='
      });
      expect(result.tokens[2]).toMatchObject({
        type: 'keyword_date',
        operator: '<='
      });
    });

    it('should parse year-only dates', () => {
      const result = parser.parse('created:2024');
      
      expect(result.tokens).toHaveLength(4); // Gets expanded to range
      expect(result.tokens[1]).toMatchObject({
        type: 'keyword_date',
        operator: '>='
      });
      expect(result.tokens[2]).toMatchObject({
        type: 'keyword_date',
        operator: '<='
      });
    });
  });

  describe('Range Syntax', () => {
    it('should parse numeric ranges', () => {
      const result = parser.parse('price:100..200');
      
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_numeric',
        operator: '>=',
        value: 100
      });
      expect(result.tokens[1]).toMatchObject({
        type: 'keyword_numeric',
        operator: '<=',
        value: 200
      });
    });

    it('should parse date ranges', () => {
      const result = parser.parse('created:2024-01-01..2024-12-31');
      
      expect(result.tokens).toHaveLength(4); // open_paren, date>=, date<=, close_paren
      expect(result.tokens[1]).toMatchObject({
        type: 'keyword_date',
        operator: '>='
      });
      expect(result.tokens[2]).toMatchObject({
        type: 'keyword_date',
        operator: '<='
      });
    });

    it('should parse month ranges', () => {
      const result = parser.parse('created:2024-01..2024-06');
      
      expect(result.tokens).toHaveLength(4);
      expect(result.tokens[1]).toMatchObject({
        type: 'keyword_date',
        operator: '>='
      });
    });

    it('should parse year ranges', () => {
      const result = parser.parse('created:2020..2024');
      
      expect(result.tokens).toHaveLength(4);
      expect(result.tokens[1]).toMatchObject({
        type: 'keyword_date',
        operator: '>='
      });
    });
  });

  describe('Parser Options', () => {
    describe('validKeys option', () => {
      it('should accept valid keys', () => {
        const parser = new TestQueryParser({ validKeys: ['title', 'author'] });
        const result = parser.parse('author:Tolkien');
        
        expect(result.metadata.hasErrors).toBe(false);
        expect(result.tokens).toHaveLength(1);
      });

      it('should reject invalid keys', () => {
        const parser = new TestQueryParser({ validKeys: ['title', 'author'] });
        const result = parser.parse('invalid:value');
        
        expect(result.metadata.hasErrors).toBe(true);
        expect(result.metadata.errors[0]).toMatchObject({
          type: 'invalid_key',
          key: 'invalid',
          value: 'value'
        });
      });

      it('should handle negated invalid keys', () => {
        const parser = new TestQueryParser({ validKeys: ['title'] });
        const result = parser.parse('-invalid:value');
        
        expect(result.metadata.hasErrors).toBe(true);
        expect(result.tokens).toHaveLength(0); // Negation token should be removed
      });
    });

    describe('defaultKey option', () => {
      it('should use default key for bare words', () => {
        const parser = new TestQueryParser({ defaultKey: 'content' });
        const result = parser.parse('hello');
        
        expect(result.tokens[0]).toMatchObject({
          type: 'keyword',
          key: 'content',
          value: 'hello'
        });
      });

      it('should use default key for phrases', () => {
        const parser = new TestQueryParser({ defaultKey: 'content' });
        const result = parser.parse('"hello world"');
        
        expect(result.tokens[0]).toMatchObject({
          type: 'keyword_phrase',
          key: 'content',
          value: 'hello world'
        });
      });

      it('should use default key for regex', () => {
        const parser = new TestQueryParser({ defaultKey: 'content' });
        const result = parser.parse('/test.*/');
        
        expect(result.tokens[0]).toMatchObject({
          type: 'keyword_regex',
          key: 'content',
          value: 'test.*'
        });
      });
    });
  });

  describe('AST Conditions', () => {
    it('should extract simple conditions', () => {
      const result = parser.parse('author:Tolkien');
      
      expect(result.astConditions).toHaveLength(1);
      expect(result.astConditions[0]).toMatchObject({
        key: 'author',
        value: 'Tolkien',
        isNegated: false,
        isRegex: false,
        isNumeric: false,
        isDate: false
      });
    });

    it('should mark regex conditions', () => {
      const result = parser.parse('name:/test.*/');
      
      expect(result.astConditions[0]?.isRegex).toBe(true);
    });

    it('should mark numeric conditions', () => {
      const result = parser.parse('price>100');
      
      expect(result.astConditions[0]).toMatchObject({
        isNumeric: true,
        operator: '>'
      });
    });

    it('should mark date conditions', () => {
      const result = parser.parse('created>=2024-01-01');
      
      expect(result.astConditions[0]).toMatchObject({
        isDate: true,
        operator: '>='
      });
    });

    it('should handle negated conditions', () => {
      const result = parser.parse('-author:Tolkien');
      
      expect(result.astConditions[0]?.isNegated).toBe(true);
    });
  });

  describe('Complex Queries', () => {
    it('should parse complex boolean logic', () => {
      const result = parser.parse('(author:Tolkien OR author:Lewis) AND -title:"The Hobbit"');
      
      expect(result.ast?.type).toBe('binary');
      expect(result.ast?.operator).toBe('AND');
      expect(result.astConditions).toHaveLength(3);
    });

    it('should handle nested parentheses', () => {
      const result = parser.parse('((a:1 OR b:2) AND (c:3 OR d:4))');
      
      expect(result.ast?.type).toBe('binary');
      expect(result.astConditions).toHaveLength(4);
    });

    it('should parse mixed content types', () => {
      const query = 'author:Tolkien "fantasy book" /hobbit.*/i price>20 created:2024';
      const result = parser.parse(query);
      
      expect(result.astConditions.length).toBeGreaterThan(4);
      expect(result.astConditions.some(c => c.isRegex)).toBe(true);
      expect(result.astConditions.some(c => c.isNumeric)).toBe(true);
      expect(result.astConditions.some(c => c.isDate)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors', () => {
      const result = parser.parse('author: OR title:');
      
      expect(result.metadata.hasErrors).toBe(true);
    });

    it('should handle empty parentheses', () => {
      const result = parser.parse('()');
      
      expect(result.tokens).toHaveLength(0); // Empty parens should be removed
    });

    it('should handle consecutive operators', () => {
      const result = parser.parse('hello AND OR world');
      
      expect(result.tokens.filter(t => t.type === 'operator')).toHaveLength(1);
    });
  });

  describe('Normalization', () => {
    it('should normalize multiple spaces', () => {
      const result = parser.parse('hello    world');
      
      expect(result.metadata.originalQuery).toBe('hello world');
    });

    it('should trim leading and trailing spaces', () => {
      const result = parser.parse('  hello world  ');
      
      expect(result.metadata.originalQuery).toBe('hello world');
    });
  });

  describe('Performance and Metadata', () => {
    it('should track parse time', () => {
      const result = parser.parse('simple query');
      
      expect(result.metadata.parseTime).toBeGreaterThan(0);
      expect(typeof result.metadata.parseTime).toBe('number');
    });

    it('should preserve original query', () => {
      const query = 'author:Tolkien -title:"The Hobbit"';
      const result = parser.parse(query);
      
      expect(result.metadata.originalQuery).toBe(query);
    });

    it('should indicate error status', () => {
      const validResult = parser.parse('author:Tolkien');
      expect(validResult.metadata.hasErrors).toBe(false);
      
      const parser2 = new TestQueryParser({ validKeys: ['title'] });
      const invalidResult = parser2.parse('invalid:key');
      expect(invalidResult.metadata.hasErrors).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query', () => {
      const result = parser.parse('');
      
      expect(result.tokens).toHaveLength(0);
      expect(result.ast).toBeNull();
      expect(result.astConditions).toHaveLength(0);
    });

    it('should handle whitespace-only query', () => {
      const result = parser.parse('   ');
      
      expect(result.tokens).toHaveLength(0);
      expect(result.metadata.originalQuery).toBe('');
    });

    it('should handle unclosed quotes', () => {
      const result = parser.parse('"unclosed quote');
      
      expect(result.metadata.hasErrors).toBe(true);
    });

    it('should handle unmatched parentheses', () => {
      const result = parser.parse('(hello world');
      
      // Parser should still work, just with unmatched structure
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it('should handle special characters in values', () => {
      const result = parser.parse('email:"user@example.com"');
      
      expect(result.tokens[0]).toMatchObject({
        type: 'keyword_phrase',
        key: 'email',
        value: 'user@example.com'
      });
    });
  });
});