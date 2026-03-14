import { describe, expect, it } from "vitest";
import { stripBotMention } from "./bot";

describe("stripBotMention", () => {
  it("removes a mention at the start", () => {
    expect(stripBotMention("@SketchBot hello", "SketchBot")).toBe("hello");
  });

  it("removes a mention in the middle", () => {
    expect(stripBotMention("hey @SketchBot what's up", "SketchBot")).toBe("hey what's up");
  });

  it("removes a mention at the end", () => {
    expect(stripBotMention("thanks @SketchBot", "SketchBot")).toBe("thanks");
  });

  it("is case insensitive", () => {
    expect(stripBotMention("@sketchbot help", "SketchBot")).toBe("help");
  });

  it("removes multiple mentions", () => {
    expect(stripBotMention("@SketchBot hey @SketchBot", "SketchBot")).toBe("hey");
  });

  it("returns original text when no mention present", () => {
    expect(stripBotMention("hello world", "SketchBot")).toBe("hello world");
  });

  it("returns text unchanged when botUsername is empty", () => {
    expect(stripBotMention("@someone hello", "")).toBe("@someone hello");
  });

  it("collapses extra whitespace after removal", () => {
    expect(stripBotMention("hello  @SketchBot  world", "SketchBot")).toBe("hello world");
  });

  it("handles special regex characters in username", () => {
    expect(stripBotMention("@bot.test hi", "bot.test")).toBe("hi");
  });
});
