(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.buildTrackedHull=factory();})(typeof window==='undefined'?globalThis:window,function(){return function({block,cylinder,paint,edge,rubber,tank,wheels}){
  block(5.5,.8,2.7,0,1.18,0);
  block(5.85,.17,3.3,0,1.65,0,edge);
  for(const side of [-1,1]){
    block(5.6,.82,.6,0,.66,side*1.5,rubber);
    for(let i=0;i<7;i++){
      const w=cylinder(.42,.18,-2.05+i*.66,.65,side*1.85,edge,tank,'z');wheels.push(w);
      cylinder(.13,.20,-2.05+i*.66,.65,side*1.87,paint,tank,'z');
    }
    for(let i=0;i<12;i++)block(.16,.12,.64,-2.5+i*.45,1.12,side*1.5,edge);
    block(1.2,.04,.68,1.9,1.77,side*.75,rubber);
    for(let i=0;i<7;i++)block(.045,.06,.64,1.4+i*.15,1.80,side*.75,edge);
  }
};});
