// Exercise the real desktop toolbar or its phone sheet, never hidden clicks.
exports.clickTool = async (page, selector) => {
  const target = page.locator(selector);
  const sheet = !await target.isVisible();
  if (sheet) await page.locator("#mobile-tools").click();
  await target.click();
  if (sheet) await page.locator(".tool-menu-dialog").waitFor({state:"detached"});
};
