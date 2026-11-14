const assert = require('node:assert/strict');

// Check the rendered paint bounds, not just the outer rail. An absolutely
// positioned inline fill with no left edge can start halfway across its meter.
exports.assertVerticalEquity = async page => {
  const geometry = await page.locator('#equity-bar').evaluate(node => {
    const rect = n => {const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const meter=node.querySelector('.equity-meter'),fill=node.querySelector('.equity-fill');
    return {rail:rect(node),meter:rect(meter),fill:rect(fill),
      labels:[...node.querySelectorAll('.equity-number')].map(n=>({...rect(n),text:n.textContent})),
      fraction:parseFloat(fill.style.getPropertyValue('--equity-fraction'))/100,
      middleLeft:getComputedStyle(meter,'::after').left};
  });
  const {rail,meter,fill,labels:[top,bottom],fraction}=geometry;
  const close=(a,b)=>Math.abs(a-b)<1.1, message=JSON.stringify(geometry);
  assert.ok(meter.width>=14 && meter.height>meter.width, message);
  assert.ok(close(fill.left,meter.left+1) && close(fill.right,meter.right-1), 'both colors fill the entire track: '+message);
  assert.ok(close(fill.height,(meter.height-2)*fraction) && close(fill.bottom,meter.bottom-1),message);
  assert.equal(geometry.middleLeft,'0px','midpoint line spans the whole track');
  assert.ok(top.bottom<meter.top && bottom.top>meter.bottom,'values sit above/below the track: '+message);
  for(const label of [top,bottom]) {
    assert.ok(close(label.left+label.width/2,meter.left+meter.width/2),'values are centered: '+message);
    assert.ok(label.top>=rail.top-1 && label.bottom<=rail.bottom+1,'values remain inside the rail: '+message);
  }
  assert.ok(close(rail.left+rail.width/2,meter.left+meter.width/2),message);
  return geometry;
};
