import { expect, test } from "@playwright/test";
import type { ActionEntry, ActionItem } from "../lib/tasks/actions";
const path=process.env.ACTIONS_MOBILE_BUNDLE==="true"?"/#/tasks?section=actions":"/tasks?section=actions";
async function section(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "打开本模块功能", exact: true }).click();
  await page.getByRole("navigation", { name: "模块内导航" }).getByRole("link", { name, exact: true }).click();
}
for(const width of [360,1440]) test(`action, habit, goal and export journey at ${width}px`,async({page})=>{
  const items:ActionItem[]=[],entries:ActionEntry[]=[];let writes=0;
  await page.setViewportSize({width,height:900});
  await page.route("**/api/v1/**",async(route)=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname!=="/api/v1/actions") return route.fulfill({json:{data:[]}});
    if(req.method()==="GET")return route.fulfill({json:{data:url.searchParams.get("export")==="1"?{format:"ai-study-companion.actions",schemaVersion:1,items,entries,events:[]}:{today:"2030-01-02",items,entries}}});
    const input=req.postDataJSON();writes++;
    let item=items.find((i)=>i.id===input.id);
    if(input.operation==="create"){item={id:crypto.randomUUID(),version:1,data:input.data};items.push(item);}
    else{
      if(!item||item.version!==input.expectedVersion)return route.fulfill({status:409,json:{error:{message:"另一端已更新，草稿保留"}}});
      item.version++;
      if(input.operation==="record"){
        const entry:ActionEntry={itemId:item.id,day:input.day,value:input.value,state:input.state,note:input.note,rule:item.data.rules[0]??null,recordedAt:"2030-01-02T08:00:00Z",backfill:false};
        const old=entries.findIndex((e)=>e.itemId===item!.id&&e.day===input.day);if(old<0)entries.push(entry);else entries[old]=entry;
        if(item.data.kind==="todo")item.data.completedOn=input.state==="done"?input.day:null;
      }else if(input.operation==="update")Object.assign(item.data,{title:input.title,note:input.note,dueOn:input.dueOn,status:input.status,goalId:input.goalId});
    }
    return route.fulfill({json:{data:item}});
  });
  await page.goto(path);
  await page.getByLabel("行动名称",{exact:true}).fill("R6测试待办");
  await page.getByRole("button",{name:"添加待办",exact:true}).click();
  const todo=page.getByRole("article").filter({has:page.getByRole("heading",{name:"R6测试待办",exact:true})});
  await todo.getByText("更多操作", { exact: true }).click(); await todo.getByRole("button",{name:"今日跳过",exact:true}).click();
  await expect(page.getByRole("heading",{name:/今日跳过/})).toBeVisible();
  await todo.getByRole("button",{name:"标记完成",exact:true}).click();await expect(todo.getByRole("button",{name:"撤销完成"})).toBeVisible();
  await todo.getByRole("button",{name:"撤销完成"}).click();await expect(todo.getByRole("button",{name:"标记完成",exact:true})).toBeVisible();
  await section(page, "习惯打卡");
  await page.locator("summary").filter({hasText:"创建习惯"}).click();
  await page.getByLabel("习惯名称").fill("R6背单词");await page.getByLabel("每日目标量").fill("20");await page.getByLabel("单位（如次、个、分钟）").fill("个");
  await page.getByRole("button",{name:"创建习惯",exact:true}).click();
  await page.getByRole("article").filter({hasText:"R6背单词"}).getByRole("button",{name:"记录 / 补卡"}).click();
  await page.getByLabel("当天总量",{exact:false}).fill("20");await page.getByRole("button",{name:"保存打卡"}).click();
  await section(page, "日历与统计");
  await expect(page.getByText("本月累计达标 1 天",{exact:false})).toBeVisible();
  await section(page, "目标");
  await page.getByLabel("目标名称",{exact:true}).fill("R6学习目标");await page.getByRole("button",{name:"创建目标",exact:true}).click();
  await page.getByLabel("关联已有步骤 / 习惯").selectOption({label:"R6测试待办"});await page.getByLabel("所属目标").selectOption({label:"R6学习目标"});await page.getByRole("button",{name:"保存目标关联"}).click();
  await expect(page.getByRole("article").filter({has:page.getByRole("heading",{name:/R6学习目标/})})).toContainText("一次性步骤 0/1");
  await section(page, "提醒联动");
  await page.getByText("导出行动与更正历史",{exact:true}).click();await page.getByLabel(/我知道文件含全部事项/).check();
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"导出范围行动包"}).click();expect((await download).suggestedFilename()).toMatch(/^actions-.*\.json$/);
  expect(writes).toBe(8);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
test("action edit conflict preserves drafts and guards switching to scheduler",async({page})=>{
  const item:ActionItem={id:crypto.randomUUID(),version:1,data:{kind:"todo",title:"原事项",note:"",startsOn:"2030-01-02",dueOn:null,status:"active",goalId:null,completedOn:null,rules:[],linkedTaskId:null}};
  await page.route("**/api/v1/**",route=>{
    if(new URL(route.request().url()).pathname!=="/api/v1/actions")return route.fulfill({json:{data:[]}});
    if(route.request().method()==="POST")return route.fulfill({status:409,json:{error:{message:"另一端已更新，草稿保留"}}});
    return route.fulfill({json:{data:{today:"2030-01-02",items:[item],entries:[]}}});
  });
  await page.goto(path);await page.getByText("更多操作", { exact: true }).click();await page.getByRole("button",{name:"编辑行动",exact:true}).click();await page.getByLabel("行动名称",{exact:true}).fill("我的未保存草稿");
  await page.getByRole("button",{name:"保存行动",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"另一端"})).toBeVisible();await expect(page.getByLabel("行动名称",{exact:true})).toHaveValue("我的未保存草稿");
  await page.getByRole("button", { name: "打开本模块功能", exact: true }).click();page.once("dialog",d=>d.dismiss());await page.getByRole("navigation",{name:"模块内导航"}).getByRole("link",{name:"定时任务",exact:true}).click();await expect(page.getByLabel("行动名称",{exact:true})).toHaveValue("我的未保存草稿");
});
