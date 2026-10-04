import { test, expect } from "bun:test";
import {
	prepareAuthRuntime,
	attachAuthRuntime,
	detachAuthRuntime,
	receiveAuthMessage,
	request,
} from "../src/auth/client";
test("cleanup from a replaced Android app view cannot disconnect the active OAuth runtime", async () => {
	const old = Symbol("old"),
		current = Symbol("current");
	prepareAuthRuntime(old);
	attachAuthRuntime(old, () => {});
	prepareAuthRuntime(current);
	const scripts = [];
	attachAuthRuntime(current, (script) => scripts.push(script));
	detachAuthRuntime(old);
	const response = request("authStatus");
	expect(scripts).toHaveLength(1);
	const id = Number(scripts[0].match(/atradioAuth\((\d+)/)[1]);
	receiveAuthMessage(JSON.stringify({ id, result: { state: "signedOut" } }));
	expect(await response).toEqual({ state: "signedOut" });
	detachAuthRuntime(current);
});
test("duplicate ready events do not submit an OAuth or write command twice", async () => {
	const owner = Symbol("runtime");
	prepareAuthRuntime(owner);
	const scripts = [];
	const response = request("authStart", "user.test");
	const inject = (script) => scripts.push(script);
	attachAuthRuntime(owner, inject);
	attachAuthRuntime(owner, inject);
	expect(scripts).toHaveLength(1);
	const id = Number(scripts[0].match(/atradioAuth\((\d+)/)[1]);
	receiveAuthMessage(JSON.stringify({ id, result: { state: "starting" } }));
	expect((await response).state).toBe("starting");
	detachAuthRuntime(owner);
});
