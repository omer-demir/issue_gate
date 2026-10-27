import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");
const config = JSON.parse(read(".devcontainer/devcontainer.json"));
const dockerfile = read(`.devcontainer/${config.build.dockerfile}`);

describe("development container", () => {
  it("uses a non-root user without privileged host access", () => {
    expect(config.remoteUser).toBe("node");
    expect(config.privileged).not.toBe(true);
    expect(config.mounts ?? []).toEqual([]);
    expect(config.runArgs ?? []).toEqual([]);
    expect(dockerfile.match(/^USER .+$/gm)?.at(-1)).toBe("USER node");
  });

  it("provides the Node and Flutter toolchains without Android tooling", () => {
    expect(dockerfile).toMatch(/^FROM node:24-bookworm$/m);
    expect(dockerfile).toMatch(/^ARG FLUTTER_VERSION=\d+\.\d+\.\d+$/m);
    const sdk = config.customizations.vscode.settings["dart.flutterSdkPath"];
    expect(sdk).toBe("/home/node/flutter");
    expect(dockerfile).toContain(`ENV FLUTTER_ROOT=${sdk}`);
    expect(dockerfile).toContain(`ENV PATH="${sdk}/bin:`);
    expect(dockerfile).toContain("--no-enable-android");
    expect(dockerfile).toContain("flutter precache --no-android");
    expect(dockerfile).not.toMatch(/sdkmanager|cmdline-tools|openjdk|ANDROID_HOME|ANDROID_SDK_ROOT/i);
  });

  it("forwards the ports used by the existing same-origin proxy", () => {
    const caddyfile = read("deploy/Caddyfile.local");
    expect(config.forwardPorts).toEqual([3000, 4000, 8080]);
    for (const port of config.forwardPorts) {
      expect(caddyfile).toContain(`:${port}`);
      expect(config.portsAttributes[String(port)].label).toBeTruthy();
    }
    expect(dockerfile).toMatch(/apt-get install[^;]*\bcaddy\b/);
  });

  it("installs all components and preserves existing web configuration", () => {
    expect(config.postCreateCommand).toBe("bash .devcontainer/post-create.sh");
    const setup = read(".devcontainer/post-create.sh");
    expect(setup).toContain("set -euo pipefail");
    expect(setup).toContain("npm ci --prefix backend");
    expect(setup).toContain("npm ci --prefix web");
    expect(setup).toMatch(/if \[\[ ! -e web\/\.env\.local \]\]; then\s+cp web\/\.env\.example web\/\.env\.local\s+fi/);
    expect(setup).toMatch(/cd mobile\s+flutter pub get/);
    expect(setup).not.toContain("flutter create");
  });
});
