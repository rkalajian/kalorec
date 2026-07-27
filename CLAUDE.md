# Project Context

This is a typescript project using raw-http.

The API has 4 routes. See .codesight/routes.md for the full route map with methods, paths, and tags.
Middleware includes: auth.

High-impact files (most imported, changes here affect many other files):
- src\lib\session.ts (imported by 11 files)
- src\lib\recipe.ts (imported by 8 files)
- src\pages\api\auth\callback.ts (imported by 7 files)
- src\lib\store.ts (imported by 4 files)
- src\lib\github.ts (imported by 3 files)
- src\lib\normalize.ts (imported by 3 files)
- src\pages\api\settings\repo.ts (imported by 3 files)
- src\lib\extract\jsonld.ts (imported by 2 files)

Required environment variables (no defaults):
- GITHUB_CLIENT_ID (.env.example)
- GITHUB_CLIENT_SECRET (.env.example)
- KEY (tests\env-vars.test.ts)
- PROD (src\lib\session.ts)
- SESSION_SECRET (.env.example)

Read .codesight/wiki/index.md for orientation (WHERE things live). Then read actual source files before implementing. Wiki articles are navigation aids, not implementation guides.
Read .codesight/CODESIGHT.md for the complete AI context map including all routes, schema, components, libraries, config, middleware, and dependency graph.
