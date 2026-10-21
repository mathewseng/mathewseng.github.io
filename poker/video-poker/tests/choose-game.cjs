// Exercise the visible game picker rather than the hidden selection state.
module.exports=async function chooseGame(page,key){
 await page.locator('#game-picker-open').click();
 await page.locator('#game-filters [data-family="All"]').click();
 await page.locator(`[data-game="${key}"]`).click();
};
