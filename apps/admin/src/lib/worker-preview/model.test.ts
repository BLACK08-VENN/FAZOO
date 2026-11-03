import { describe, it, expect } from 'vitest';
import { applyWorkerCommand, initialWorkerSession, workerSessionSchema } from './model';
describe('personal assignment workflow', () => {
it('keeps notification reading separate from acknowledgement and enforces arrival', () => {
 const seed=initialWorkerSession(); const read=applyWorkerCommand(seed,'Technician',{action:'open',id:'tech-1'});
 expect(seed.assignments[0]?.read).toBe(false); expect(read.assignments[0]?.status).toBe('new');
 expect(applyWorkerCommand(read,'Technician',{action:'open',id:'tech-1'})).toBe(read);
 expect(()=>applyWorkerCommand(read,'Technician',{action:'start',id:'tech-1'})).toThrow();
 expect(()=>applyWorkerCommand(read,'Merchandiser',{action:'open',id:'tech-1'})).toThrow();
});
it('requires the technician checklist and preserves pending approval', () => {
 let s=initialWorkerSession(); for(const action of ['acknowledge','arrive','start'] as const) s=applyWorkerCommand(s,'Technician',{action,id:'tech-1'});
 expect(()=>applyWorkerCommand(s,'Technician',{action:'submit',id:'tech-1',note:'Connection restored and tested.'})).toThrow();
 s=applyWorkerCommand(s,'Technician',{action:'block',id:'tech-1',note:'Awaiting a replacement cable'});
 s=applyWorkerCommand(s,'Technician',{action:'resume',id:'tech-1',note:'Replacement cable received'});
 for(const taskId of ['task-0','task-1']) s=applyWorkerCommand(s,'Technician',{action:'task',id:'tech-1',taskId,done:true});
 s=applyWorkerCommand(s,'Technician',{action:'submit',id:'tech-1',note:'Connection restored and tested.'});
 expect(s.assignments[0]?.status).toBe('ready_for_review');
 expect(()=>applyWorkerCommand(s,'Technician',{action:'start',id:'tech-1'})).toThrow();
});
it('requires retail photo evidence and prevents technician-only actions', () => {
 let s=workerSessionSchema.parse(initialWorkerSession());
 for(const action of ['acknowledge','arrive','start'] as const)s=applyWorkerCommand(s,'Merchandiser',{action,id:'merch-1'});
 expect(()=>applyWorkerCommand(s,'Merchandiser',{action:'block',id:'merch-1',note:'No access to store'})).toThrow();
 expect(()=>applyWorkerCommand(s,'Merchandiser',{action:'task',id:'merch-1',taskId:'photo',done:true})).toThrow();
 for(const taskId of ['task-0','task-1','task-3'])s=applyWorkerCommand(s,'Merchandiser',{action:'task',id:'merch-1',taskId,done:true});
 expect(()=>applyWorkerCommand(s,'Merchandiser',{action:'submit',id:'merch-1',note:'Shelf stock and pricing checked.'})).toThrow();
 s=applyWorkerCommand(s,'Merchandiser',{action:'photo',id:'merch-1',data:'data:image/jpeg;base64,/9j/2Q=='});
 s=applyWorkerCommand(s,'Merchandiser',{action:'submit',id:'merch-1',note:'Shelf stock and pricing checked.'});
 expect(s.assignments.find(j=>j.id==='merch-1')?.status).toBe('ready_for_review');
 expect(s.assignments.find(j=>j.id==='ba-1')?.status).toBe('new');
});
it('records reassignment requests before work begins', () => {
 const s=applyWorkerCommand(initialWorkerSession(),'Brand ambassador',{action:'requestReassignment',id:'ba-1',note:'Outside assigned territory'});
 expect(s.assignments.find(j=>j.id==='ba-1')?.status).toBe('reassignment_requested');
 expect(()=>applyWorkerCommand(s,'Brand ambassador',{action:'arrive',id:'ba-1'})).toThrow();
});
});