import { Injectable } from '@nestjs/common';
import { InventoryWorkspaceService } from './inventory-workspace.service';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { WorkflowActor } from './inventory-workflow.types';

@Injectable()
export class InventoryLabelService {
 constructor(private readonly workspace:InventoryWorkspaceService,private readonly workflow:InventoryWorkflowService){}
 /**
  * @cc [owner:nareshshah139,label:product] inventory-label-read-only
  * Label generation MUST encode the selected branch record and include its batch/expiry details;
  * printing or scanning MUST NOT mutate stock or create a workflow document.
  */
 async label(actor:WorkflowActor,id:string,document=false){
  const value=document?await this.workflow.document(actor,id):(await this.workspace.item(actor,id)).item;
  const code=document?`inventory-document:${id}`:`inventory:${id}`;
  const qr=await require('qrcode').toBuffer(code,{type:'png',width:280,margin:1,errorCorrectionLevel:'M'});
  const PDFDocument=require('pdfkit'),pdf=new PDFDocument({size:[360,240],margin:20}),chunks:Buffer[]=[];
  const done=new Promise<Buffer>((resolve,reject)=>{pdf.on('data',(b:Buffer)=>chunks.push(b));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject)});
  pdf.font('Helvetica-Bold').fontSize(14).text(document?value.reference:value.name,{width:230});pdf.moveDown(.5).font('Helvetica').fontSize(10);
  const lines=document?[`Type: ${value.kind}`,`Status: ${value.status}`,`Date: ${value.createdAt.toISOString().slice(0,10)}`]:[`Batch: ${value.batchNumber||'Not recorded'}`,`Expiry: ${value.expiryDate?new Date(value.expiryDate).toISOString().slice(0,10):'Not recorded'}`,`Stock unit: ${value.unit}`,`MRP: INR ${Number(value.mrp||value.sellingPrice).toFixed(2)}`];
  for(const line of lines)pdf.text(line,{width:230});pdf.image(qr,248,72,{width:92,height:92});pdf.fontSize(8).text(code,20,192,{width:320});pdf.text('Scan or paste this code into Inventory search.',20,216,{width:320});pdf.end();return done;
 }
}
