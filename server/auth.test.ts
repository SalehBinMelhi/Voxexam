import express from "express";
import { registerAuthRoutes } from "./auth";
import http from "http";

async function runTests() {
  console.log("=== RUNNING VOXEXAM AUTH SUITE ===");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${description}`);
      failed++;
    }
  }

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app);
  
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    console.log(`\n--- Test 1: POST /api/demo-login is unreachable when NODE_ENV=production ---`);
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEMO_LOGIN = "false";
    
    // We must re-register the routes or start a new app because registerAuthRoutes was called before we changed env
    const appProd = express();
    appProd.use(express.json());
    registerAuthRoutes(appProd);
    const serverProd = http.createServer(appProd);
    await new Promise<void>((resolve) => serverProd.listen(0, resolve));
    const portProd = (serverProd.address() as any).port;

    const resProd = await fetch(`http://localhost:${portProd}/api/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "professor" }),
    });

    assert(resProd.status === 404, `Expected 404 in production, got ${resProd.status}`);
    
    serverProd.close();

    console.log(`\n--- Test 2: POST /api/demo-login is reachable when not production ---`);
    process.env.NODE_ENV = "development";
    const appDev = express();
    appDev.use(express.json());
    registerAuthRoutes(appDev);
    const serverDev = http.createServer(appDev);
    await new Promise<void>((resolve) => serverDev.listen(0, resolve));
    const portDev = (serverDev.address() as any).port;

    // We can't fully test demo-login because it relies on DB and Passport, but we can check it doesn't return 404.
    const resDev = await fetch(`http://localhost:${portDev}/api/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "student" }),
    });

    assert(resDev.status !== 404, `Expected route to exist in dev, got ${resDev.status}`);

    console.log(`\n--- Test 3: POST /api/auth/google is removed and returns 404 ---`);
    const resGoogle = await fetch(`http://localhost:${portDev}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "professor", email: "hacker@evil.com" }),
    });
    
    assert(resGoogle.status === 404, `Expected Google route to be removed (404), got ${resGoogle.status}`);

    serverDev.close();

  } catch (error) {
    console.error("Test execution failed:", error);
    failed++;
  } finally {
    server.close();
  }

  console.log(`\n=== TEST SUMMARY ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
