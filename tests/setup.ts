import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no native top layer. Browser/Android focus and keyboard checks remain manual.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
afterEach(cleanup);
