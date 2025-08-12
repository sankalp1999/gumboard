import { test, expect } from "../fixtures/db-helpers";

test.describe("Simple DB Test", () => {
  test("should connect to database and create user", async ({ db, testUser }) => {
    // Verify test user was created
    expect(testUser.id).toBeTruthy();
    expect(testUser.email).toContain("@example.com");
    
    // Verify we can query the database
    const user = await db.user.findUnique({
      where: { id: testUser.id }
    });
    
    expect(user).toBeTruthy();
    expect(user?.email).toBe(testUser.email);
    
    console.log("✓ Database connection and user creation working");
  });

  test("should create and verify board", async ({ db, testUser, dbUtils }) => {
    // Create a board using helper
    const board = await dbUtils.seed.board(testUser.id, {
      name: "Simple Test Board"
    });
    
    // Verify it exists
    const foundBoard = await dbUtils.verify.boardExists("Simple Test Board");
    expect(foundBoard.id).toBe(board.id);
    
    console.log("✓ Board creation and verification working");
  });
});