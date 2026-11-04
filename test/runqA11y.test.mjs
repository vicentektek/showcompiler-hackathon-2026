import test from 'node:test';
import assert from 'node:assert/strict';
import {syncWorkspaceTabs,handleWorkspaceTabKey} from '../src/ui/runq-a11y.mjs';

function button(selected=false){
 const attrs=new Map([['data-workspace-nav',''],...(selected?[['aria-pressed','true']]:[])]);
 return {attrs,offsetParent:{},tabIndex:-1,
  matches(selector){return selector==='[data-workspace-nav]'&&attrs.has('data-workspace-nav')},
  getAttribute(name){return attrs.get(name)??null},setAttribute(name,value){attrs.set(name,String(value))},
  removeAttribute(name){attrs.delete(name)},focus(){this.focused=true},click(){this.clicked=true}};
}
function navWith(...children){return {children,attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v)},
 querySelectorAll(selector){return this.children.filter(child=>child.matches(selector))}}}

test('workspace tab sync is idempotent, preserves selection and supports dynamic buttons',()=>{
 const first=button(),selected=button(true),nav=navWith(first,selected);
 syncWorkspaceTabs(nav);syncWorkspaceTabs(nav);
 assert.equal(selected.getAttribute('aria-selected'),'true');
 assert.equal(selected.getAttribute('aria-pressed'),null);
 assert.deepEqual(nav.children.map(item=>item.tabIndex),[-1,0]);
 const added=button();nav.children.push(added);
 syncWorkspaceTabs(nav);
 assert.equal(selected.getAttribute('aria-selected'),'true');
 assert.deepEqual(nav.children.map(item=>item.tabIndex),[-1,0,-1]);
});

test('workspace tab keyboard navigation moves focus and activates only navigation',()=>{
 const first=button(true),second=button(),nav=navWith(first,second);
 const event={key:'ArrowRight',prevented:false,preventDefault(){this.prevented=true}};
 handleWorkspaceTabKey(nav,event,first);
 assert.equal(event.prevented,true);assert.equal(second.focused,true);assert.equal(second.clicked,true);
});
