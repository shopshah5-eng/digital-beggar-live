// responseGenerator.ts — Anti-Repetition Template Selection & Dynamic Variable Interpolation
import { RESPONSE_TEMPLATES } from "./personality";
import { sanitizeUserInput } from "../security/sanitizer";

export interface ResponseVariables {
  name?: string;
  amount?: number | string;
  businessName?: string;
  bidAmount?: number | string;
  category?: string;
}

export class ResponseGenerator {
  // Circular memory buffer keeping the last 5 responses to prevent immediate repetition
  private recentHistory: string[] = [];
  private readonly maxHistorySize: number = 5;

  /**
   * Generates a sanitized character voice line for an event category.
   * Ensures anti-repetition memory and strictly sanitized dynamic tokens.
   */
  public generateResponse(
    category: string,
    vars: ResponseVariables = {},
    options?: { deterministicIndex?: number }
  ): string {
    const templates = RESPONSE_TEMPLATES[category] || RESPONSE_TEMPLATES.IDLE;
    if (!templates || templates.length === 0) {
      return "Thank you for being part of the stream!";
    }

    let selectedTemplate: string;

    if (typeof options?.deterministicIndex === "number") {
      selectedTemplate = templates[options.deterministicIndex % templates.length];
    } else {
      selectedTemplate = this.selectNonRepeating(category, templates);
    }

    // Sanitize variables and interpolate
    return this.interpolateVariables(selectedTemplate, vars);
  }

  /**
   * Interpolates sanitized tokens into template placeholders.
   * Strips out raw HTML, script injections, and excessive whitespace.
   */
  public interpolateVariables(template: string, vars: ResponseVariables): string {
    const cleanName = sanitizeUserInput(String(vars.name || "Bhai"), { maxLength: 30 }) || "Bhai";
    const cleanBusiness = sanitizeUserInput(String(vars.businessName || "Sponsor"), { maxLength: 40 }) || "Sponsor";
    const cleanCategory = sanitizeUserInput(String(vars.category || "General"), { maxLength: 30 }) || "General";

    const cleanAmount = typeof vars.amount === "number"
      ? vars.amount.toLocaleString("en-IN")
      : sanitizeUserInput(String(vars.amount || "0"), { maxLength: 10 });

    const cleanBid = typeof vars.bidAmount === "number"
      ? vars.bidAmount.toLocaleString("en-IN")
      : sanitizeUserInput(String(vars.bidAmount || "0"), { maxLength: 10 });

    return template
      .replace(/{name}/g, cleanName)
      .replace(/{amount}/g, cleanAmount)
      .replace(/{businessName}/g, cleanBusiness)
      .replace(/{bidAmount}/g, cleanBid)
      .replace(/{category}/g, cleanCategory)
      .replace(/\s+/g, " ")
      .trim();
  }

  public selectNonRepeating(_category: string, pool: string[]): string {
    const available = pool.filter((t) => !this.recentHistory.includes(t));
    const choices = available.length > 0 ? available : pool;
    const randomIndex = Math.floor(Math.random() * choices.length);
    const selected = choices[randomIndex];
    this.recordInHistory(selected);
    return selected;
  }

  private recordInHistory(template: string): void {
    this.recentHistory.push(template);
    if (this.recentHistory.length > this.maxHistorySize) {
      this.recentHistory.shift();
    }
  }

  public getRecentHistory(): string[] {
    return [...this.recentHistory];
  }

  public clearHistory(): void {
    this.recentHistory = [];
  }
}

export const responseGenerator = new ResponseGenerator();
