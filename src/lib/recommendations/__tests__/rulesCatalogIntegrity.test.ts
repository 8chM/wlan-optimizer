/**
 * Rules-Catalog Integrity Tests — Phase 28ag
 *
 * Ensures docs/recommendations/rules.md stays in sync with the code.
 * Prevents silent drift between documented rules and actual implementation.
 *
 * RC-1: Every RecommendationType appears in rules.md
 * RC-2: Rule count in rules.md matches regex-counted rules
 * RC-3: No i18n keys referenced in rules.md that don't exist
 * RC-4: rules.md Total types count matches actual type count
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Load rules.md ──────────────────────────────────────────────

const RULES_MD_PATH = resolve(__dirname, '../../../../docs/recommendations/rules.md');
const RULES_MD = readFileSync(RULES_MD_PATH, 'utf-8');

// ─── Load i18n keys ─────────────────────────────────────────────

const I18N_DIR = resolve(__dirname, '../../../lib/i18n/messages');

function loadRecKeys(lang: string): Set<string> {
  const json = JSON.parse(readFileSync(resolve(I18N_DIR, `${lang}.json`), 'utf-8'));
  const recObj = json.rec;
  if (!recObj || typeof recObj !== 'object') return new Set();
  return new Set(Object.keys(recObj));
}

const EN_KEYS = loadRecKeys('en');

// ─── Load RecommendationType union from types.ts ────────────────

function extractRecommendationTypes(): string[] {
  const src = readFileSync(resolve(__dirname, '../types.ts'), 'utf-8');
  const pattern = /export type RecommendationType\s*=\s*([\s\S]*?);/;
  const match = pattern.exec(src);
  if (!match) return [];
  const block = match[1]!;
  const types: string[] = [];
  const itemPattern = /'\s*([a-z_]+)\s*'/g;
  let m;
  while ((m = itemPattern.exec(block)) !== null) {
    types.push(m[1]!);
  }
  return types;
}

const RECOMMENDATION_TYPES = extractRecommendationTypes();

// ─── Extract rule IDs from rules.md ─────────────────────────────

function extractRuleIds(): string[] {
  // Match patterns like | CH-01 | or | AM-07a2 | or | RM-14 |
  const pattern = /\|\s*([A-Z]{2,3}-\d+[a-z]?\d?)\s*\|/g;
  const ids: string[] = [];
  let match;
  while ((match = pattern.exec(RULES_MD)) !== null) {
    ids.push(match[1]!);
  }
  // Deduplicate (some IDs appear in summary table too)
  return [...new Set(ids)];
}

const RULE_IDS = extractRuleIds();

// ─── Extract i18n key references from rules.md ──────────────────

function extractReferencedI18nKeys(): string[] {
  // Match patterns like: xxxTitle, xxxReason (camelCase key suffixes that appear in the doc)
  // Only match known key patterns to avoid false positives
  const pattern = /\b([a-z][a-zA-Z]*(?:Title|Reason))\b/g;
  const keys: string[] = [];
  let match;
  while ((match = pattern.exec(RULES_MD)) !== null) {
    keys.push(match[1]!);
  }
  return [...new Set(keys)];
}

const REFERENCED_KEYS = extractReferencedI18nKeys();

// ─── Tests ──────────────────────────────────────────────────────

describe('Rules Catalog Integrity (Phase 28ag)', () => {
  describe('RC-1: Every RecommendationType appears in rules.md', () => {
    it('all types from types.ts union are mentioned in rules.md', () => {
      const missing: string[] = [];
      for (const type of RECOMMENDATION_TYPES) {
        if (!RULES_MD.includes(type)) {
          missing.push(type);
        }
      }
      expect(missing, `Types missing in rules.md: ${missing.join(', ')}`).toHaveLength(0);
    });

    it('extracts at least 21 types from types.ts', () => {
      expect(RECOMMENDATION_TYPES.length).toBeGreaterThanOrEqual(21);
    });
  });

  describe('RC-2: Rule count matches regex-counted IDs', () => {
    it('extracts at least 80 unique rule IDs from rules.md', () => {
      // Current count is 88 — use 80 as floor to avoid flakiness on minor changes
      expect(RULE_IDS.length, `Found only ${RULE_IDS.length} rule IDs`).toBeGreaterThanOrEqual(80);
    });

    it('rules.md "Total" line matches actual count', () => {
      const totalMatch = /\*\*Total:\s*(\d+)\s*rules/.exec(RULES_MD);
      expect(totalMatch, 'rules.md must contain a "Total: N rules" line').not.toBeNull();
      if (totalMatch) {
        const stated = parseInt(totalMatch[1]!, 10);
        expect(
          stated,
          `rules.md states ${stated} rules but regex found ${RULE_IDS.length}`,
        ).toBe(RULE_IDS.length);
      }
    });
  });

  describe('RC-3: i18n keys referenced in rules.md exist', () => {
    it('every Title/Reason key referenced in rules.md exists in en.json rec object', () => {
      const missing: string[] = [];
      for (const key of REFERENCED_KEYS) {
        // Only check keys that look like actual i18n rec keys (not generic English words)
        if (key.length > 8 && !EN_KEYS.has(key)) {
          // Double-check: some keys are partial references (e.g., "stickyClientRiskTitle")
          // Only flag if it's clearly a rec key pattern
          if (key.endsWith('Title') || key.endsWith('Reason')) {
            missing.push(key);
          }
        }
      }
      expect(missing, `Keys in rules.md not found in en.json rec: ${missing.join(', ')}`).toHaveLength(0);
    });
  });

  describe('RC-4: Total types count is accurate', () => {
    it('rules.md "Total types" line matches RecommendationType union size', () => {
      const typesMatch = /Total types:\s*(\d+)/.exec(RULES_MD);
      expect(typesMatch, 'rules.md must contain "Total types: N"').not.toBeNull();
      if (typesMatch) {
        const stated = parseInt(typesMatch[1]!, 10);
        expect(
          stated,
          `rules.md states ${stated} types but union has ${RECOMMENDATION_TYPES.length}`,
        ).toBe(RECOMMENDATION_TYPES.length);
      }
    });
  });

  // ─── RC-7..RC-9: Rule Drift Stopper (Phase 28av) ───────────────

  describe('RC-7: Rule IDs are unique (no duplicates)', () => {
    it('no rule ID appears more than once in detail tables', () => {
      // Only scan detail sections (before Summary) to avoid double-counting
      // rule IDs that also appear in the summary table
      const summaryIdx = RULES_MD.indexOf('## Summary');
      const detailSection = summaryIdx > 0 ? RULES_MD.slice(0, summaryIdx) : RULES_MD;

      const pattern = /\|\s*([A-Z]{2,3}-\d+[a-z]?\d?)\s*\|/g;
      const all: string[] = [];
      let match;
      while ((match = pattern.exec(detailSection)) !== null) {
        all.push(match[1]!);
      }

      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const id of all) {
        if (seen.has(id)) duplicates.push(id);
        seen.add(id);
      }

      expect(duplicates, `Duplicate rule IDs in rules.md: ${duplicates.join(', ')}`).toHaveLength(0);
    });
  });

  describe('RC-8: Every rule ID belongs to exactly one cluster', () => {
    it('every rule ID prefix appears in the summary table', () => {
      // Extract unique prefixes from detail rule IDs
      const prefixes = [...new Set(RULE_IDS.map(id => id.replace(/-\d+.*$/, '')))];

      // Extract summary section
      const summaryMatch = /## Summary([\s\S]*?)(?=\n---|\n## |$)/.exec(RULES_MD);
      expect(summaryMatch, 'rules.md must have a Summary section').not.toBeNull();
      const summary = summaryMatch![1]!;

      const orphans: string[] = [];
      for (const prefix of prefixes) {
        if (!summary.includes(prefix + '-')) {
          orphans.push(prefix);
        }
      }

      expect(orphans, `Rule prefixes not in Summary: ${orphans.join(', ')}`).toHaveLength(0);
    });

    it('no rule ID prefix appears in multiple cluster headings', () => {
      // Split by cluster headings (## N.)
      const clusterPattern = /^## \d+\.\s+(.+)$/gm;
      const clusters: { name: string; start: number }[] = [];
      let match;
      while ((match = clusterPattern.exec(RULES_MD)) !== null) {
        clusters.push({ name: match[1]!, start: match.index });
      }

      // Also add "Additional Rules" section
      const addMatch = /^## Additional Rules$/m.exec(RULES_MD);
      if (addMatch) {
        clusters.push({ name: 'Additional Rules', start: addMatch.index });
      }

      // For each cluster section, extract rule ID prefixes
      const prefixToCluster = new Map<string, string[]>();
      for (let i = 0; i < clusters.length; i++) {
        const start = clusters[i]!.start;
        const end = i + 1 < clusters.length ? clusters[i + 1]!.start : RULES_MD.length;
        const section = RULES_MD.slice(start, end);

        const idPattern = /\|\s*([A-Z]{2,3}-\d+[a-z]?\d?)\s*\|/g;
        const prefixes = new Set<string>();
        let m;
        while ((m = idPattern.exec(section)) !== null) {
          prefixes.add(m[1]!.replace(/-\d+.*$/, ''));
        }

        for (const prefix of prefixes) {
          if (!prefixToCluster.has(prefix)) prefixToCluster.set(prefix, []);
          prefixToCluster.get(prefix)!.push(clusters[i]!.name);
        }
      }

      const multiCluster: string[] = [];
      for (const [prefix, owners] of prefixToCluster) {
        if (owners.length > 1) {
          multiCluster.push(`${prefix} → [${owners.join(', ')}]`);
        }
      }

      expect(
        multiCluster,
        `Rule prefixes in multiple clusters: ${multiCluster.join('; ')}`,
      ).toHaveLength(0);
    });
  });

  describe('RC-9: Total rule count is exact', () => {
    it('rules.md has exactly the stated number of rules', () => {
      const totalMatch = /\*\*Total:\s*(\d+)\s*rules/.exec(RULES_MD);
      expect(totalMatch, 'rules.md must state total rules').not.toBeNull();
      const stated = parseInt(totalMatch![1]!, 10);

      // Hard check: RULE_IDS count must equal stated total exactly
      expect(
        RULE_IDS.length,
        `Extracted ${RULE_IDS.length} rule IDs but rules.md states ${stated}`,
      ).toBe(stated);
    });
  });
});
