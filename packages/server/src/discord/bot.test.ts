import { describe, expect, it } from "vitest";
import { stripBotMention } from "./bot";

describe("stripBotMention", () => {
  it("removes a standard mention", () => {
    expect(stripBotMention("<@123456789> hello", "123456789")).toBe("hello");
  });

  it("removes a nickname mention with !", () => {
    expect(stripBotMention("<@!123456789> hello", "123456789")).toBe("hello");
  });

  it("removes mention in the middle of text", () => {
    expect(stripBotMention("hey <@123456789> what's up", "123456789")).toBe("hey what's up");
  });

  it("removes multiple mentions", () => {
    expect(stripBotMention("<@123456789> hey <@123456789>", "123456789")).toBe("hey");
  });

  it("returns original text when no mention present", () => {
    expect(stripBotMention("hello world", "123456789")).toBe("hello world");
  });

  it("does not remove mentions for different bot IDs", () => {
    expect(stripBotMention("<@999999999> hello", "123456789")).toBe("<@999999999> hello");
  });

  it("collapses extra whitespace after removal", () => {
    expect(stripBotMention("hello  <@123456789>  world", "123456789")).toBe("hello world");
  });
});
