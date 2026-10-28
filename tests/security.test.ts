import { expect, it } from "vitest";
import { isExternalUrl, requireExternalUrl } from "../src/lib/urls";

it("accepts ordinary web URLs and rejects executable or privileged schemes", () => {
  expect(requireExternalUrl(" https://example.com/article ")).toBe("https://example.com/article");
  expect(requireExternalUrl("http://example.com/article")).toBe("http://example.com/article");
  expect(isExternalUrl("javascript:alert(1)")).toBe(false);
  expect(isExternalUrl("file:///etc/passwd")).toBe(false);
  expect(isExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  expect(isExternalUrl("https://user:pass@example.com/article")).toBe(false);
});
