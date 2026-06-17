/**
 * Tests for PSEE Resolver
 */

const pseeResolver = require('../src/pseeResolver');

describe('PSEEResolver', () => {
  describe('extractProductName', () => {
    test('should extract product name from standard OCM alert', () => {
      const description = 'Description: Name: TS021494518 Db2 Linux, Unix and Windows';
      const result = pseeResolver.extractProductName(description);
      expect(result).toBe('Db2 Linux, Unix and Windows');
    });

    test('should extract product name with special characters', () => {
      const description = 'Description: Name: TS021494518 Watson Assistant (Cloud)';
      const result = pseeResolver.extractProductName(description);
      expect(result).toBe('Watson Assistant (Cloud)');
    });

    test('should handle product names with numbers', () => {
      const description = 'Description: Name: TS021494518 Db2 Warehouse on Cloud v11.5';
      const result = pseeResolver.extractProductName(description);
      expect(result).toBe('Db2 Warehouse on Cloud v11.5');
    });

    test('should return null for invalid format', () => {
      const description = 'Invalid format without proper structure';
      const result = pseeResolver.extractProductName(description);
      expect(result).toBeNull();
    });

    test('should handle lowercase description', () => {
      const description = 'description: name: TS021494518 Db2 Linux, Unix and Windows';
      const result = pseeResolver.extractProductName(description);
      expect(result).toBe('Db2 Linux, Unix and Windows');
    });
  });

  describe('extractIncidentNumber', () => {
    test('should extract incident number with hash', () => {
      const alertText = 'IBM On Call Manager\nIncident: #0000-0320\nState: Unassigned';
      const result = pseeResolver.extractIncidentNumber(alertText);
      expect(result).toBe('#0000-0320');
    });

    test('should extract incident number without hash', () => {
      const alertText = 'IBM On Call Manager\nIncident: 0000-0320\nState: Unassigned';
      const result = pseeResolver.extractIncidentNumber(alertText);
      expect(result).toBe('0000-0320');
    });

    test('should handle different incident formats', () => {
      const alertText = 'Incident: #1234-5678';
      const result = pseeResolver.extractIncidentNumber(alertText);
      expect(result).toBe('#1234-5678');
    });

    test('should return null for missing incident', () => {
      const alertText = 'No incident number here';
      const result = pseeResolver.extractIncidentNumber(alertText);
      expect(result).toBeNull();
    });
  });

  describe('formatNotificationMessage', () => {
    test('should format message when PSEE found', () => {
      const resolution = {
        success: true,
        pseeFound: true,
        productName: 'Db2 Linux, Unix and Windows',
        primaryUsers: [{ id: 'U123', name: 'John Doe', email: 'john@ibm.com' }],
        ccUsers: [{ id: 'U456', name: 'Jaswinder', email: 'jaswinder@ibm.com' }],
        pseeInfo: { name: 'John Doe', email: 'john@ibm.com' }
      };
      
      const message = pseeResolver.formatNotificationMessage(resolution, '#0000-0320');
      
      expect(message).toContain('<@U123>');
      expect(message).toContain('Db2 Linux, Unix and Windows');
      expect(message).toContain('#0000-0320');
      expect(message).toContain('John Doe');
      expect(message).toContain('<@U456>');
    });

    test('should format message when PSA fallback used', () => {
      const resolution = {
        success: true,
        pseeFound: false,
        productName: 'Unknown Product',
        fallbackReason: 'Product not configured',
        primaryUsers: [{ id: 'U789', name: 'PSA User', email: 'psa@ibm.com' }],
        ccUsers: [{ id: 'U456', name: 'Jaswinder', email: 'jaswinder@ibm.com' }]
      };
      
      const message = pseeResolver.formatNotificationMessage(resolution, '#0000-0320');
      
      expect(message).toContain('<@U789>');
      expect(message).toContain('No PSEE found');
      expect(message).toContain('Unknown Product');
      expect(message).toContain('Product not configured');
    });

    test('should format error message', () => {
      const resolution = {
        success: false,
        error: 'API connection failed'
      };
      
      const message = pseeResolver.formatNotificationMessage(resolution, '#0000-0320');
      
      expect(message).toContain('Error');
      expect(message).toContain('#0000-0320');
      expect(message).toContain('API connection failed');
    });
  });
});

// Made with Bob
