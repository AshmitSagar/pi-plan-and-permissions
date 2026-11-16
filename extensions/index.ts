import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activate } from "../src/pi/activate.ts";

export default function (pi: ExtensionAPI): void {
  activate(pi);
}
