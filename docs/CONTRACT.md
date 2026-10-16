# Integration contract

This independent implementation uses observed workflows as behavioral reference only. Do not import, execute or copy original extracted application code/assets, credentials, endpoint implementation or Tencent backend. React/Vite frontend; Express backend; JSON atomic local persistence; Electron wrapper. Credentials are read only by the server from a private TOML file or environment variables, with optional Codex configuration compatibility (see CONFIGURATION.md). They must never be sent to the frontend or committed to the repository. Chinese UI.

## State
GET /api/state -> {tasks,workspaces,skills,experts,connectors,schedules,library,settings,provider,activities,capabilities}
task = {id,title,workspaceId,scene:'work'|'code'|'design',status:'idle'|'running'|'awaiting_approval'|'completed'|'failed'|'stopped',messages:[{id,role:'user'|'assistant',content,createdAt}],events:[{id,type,message,createdAt,tool?,args?,status?,requestId?}],artifactPaths:[],createdAt,updatedAt,model,expertId,skillIds:[],mode:'default'|'readOnly',archived:false,error?}
workspace={id,name,path,createdAt}; skill={id,name,description,category,instructions,enabled,builtin}; expert={id,name,description,category,instructions,skillIds}; connector={id,name,description,type:'http'|'stdio',url,command,args:[],status,toolCount,tools:[],error?}; schedule={id,name,prompt,workspaceId,intervalMinutes,nextRunAt,enabled,lastRunAt?,lastTaskId?,mode:'readOnly'|'default'}; library={id,name,path,workspaceId,type,size,createdAt}; activities={id,createdAt,type,message}; settings={theme:'light'|'dark',memory,customInstructions,model,maxSteps}; provider={baseUrl,model,source,configured,protocol:'responses',error?}; capabilities=[{id,name,status:'ready'|'needs_configuration'|'external',description}].

## API
- GET /api/events SSE event 'change' -> {type,taskId?}; frontend reload state, throttled.
- POST /api/tasks {prompt,workspaceId,scene,expertId,skillIds,mode,model,start?:false} -> task; starts by default. A message run is async, immediate 201.
- POST /api/tasks/:id/messages {content} -> task, append user and start.
- POST /api/tasks/:id/run {} -> task; POST /api/tasks/:id/stop {}; POST /api/tasks/:id/approval {requestId,allow}.
- PATCH /api/tasks/:id {title,archived}; DELETE /api/tasks/:id.
- POST /api/workspaces {name,path?}; default workspace created at .data/workspaces/default. GET /api/files?workspaceId=&path= relative -> {path,entries:[{name,path,type:'directory'|'file',size}],content?,type?}; GET /api/file?workspaceId=&path= for downloaded raw file, Content-Disposition attachment. POST /api/files {workspaceId,path,content}. POST /api/upload {workspaceId,name,base64} -> library item. GET /api/preview?workspaceId=&path= -> {type:'text'|'html'|'image'|'pdf'|'table',content?,html?,rows?,columns?,url?}; HTML must render sandboxed without scripts or same-origin.
- POST /api/skills {name,description,category,instructions}; PATCH /api/skills/:id {enabled,...}; DELETE.
- POST /api/experts {name,description,category,instructions,skillIds}; PATCH and DELETE.
- POST /api/connectors {name,type,url,command,args}; POST /api/connectors/:id/connect {}; DELETE. Start external MCP processes only when user clicks connect; no automatic connection on server startup.
- POST /api/schedules {name,prompt,workspaceId,intervalMinutes,enabled,mode}; PATCH and DELETE; POST /api/schedules/:id/run -> task. Background runs must be readOnly (no unattended escalation).
- PATCH /api/settings {theme,memory,customInstructions,model,maxSteps}; POST /api/provider/test -> {ok,model,latencyMs,error?}; GET /api/search?q= -> {tasks,library,workspaces,skills}.
- API errors JSON {error} with useful Chinese error; secrets must be redacted.

## Backend modules (ownership)
Primary owns server/store.js (exports Store/createId/now), index.js HTTP and scheduler, files.js, connectors.js and desktop.
Agent worker owns server/provider.js and server/agent.js. Provider exports loadProvider(settings), publicProvider(settings), requestResponse({input,tools,model,signal,instructions,onDelta}) returns normalized response {output,text,usage}; loadProvider returns {baseUrl,apiKey,model,protocol,source}, safe secrets in memory only.
Agent exports createAgent({store,notify,connectors}) returns {run(taskId),stop(taskId),approve(taskId,requestId,allow),active(taskId),close()}. store.state directly holds state; store.save() persists; store.log(type,message); store.workspace(id) returns workspace. Agent must resolve all file paths through server/files.js export resolveWorkspacePath(workspace,relative,{write?:boolean}); exports readDirectory(workspace,relative),readText(workspace,relative),writeText(workspace,relative,content),createOffice(workspace,args) for docx/xlsx/pptx.
connectors.getTools() returns Responses function tool definitions, connectors.call(name,args,signal) executes; all MCP tools require explicit UI approval; no secret env inheritance to tools. Agent must block credentials/config folders, absolute/../symlink escape. Shell must be approve-first; no model tool output may echo API secrets; readOnly disables all mutations/shell/MCP writes. Approval events in task.events use type:'approval',requestId,tool,args,status:'pending'|'approved'|'denied'; status awaiting_approval. Provider live test and tool loop should really use existing API, no fake completion.

Frontend worker owns all src/**. Use hooks, reusable shell, substantive pages, no inert actions. Read reference report, no screenshot assets. Primary will install, build, integrate and test. Keep state plain object fields above. UI should implement actual create task, conversation, approval, file preview/upload, workspaces, market skill/expert/connector CRUD, schedules, library, memory/settings, capability status and global search. Additional cloud/team/payment/video providers must truthfully show external configuration required, not simulated success.
