// Isolated local integration server. Uses real controllers, guards and services.
const path=require('node:path'),root=path.resolve(__dirname,'../..');
process.env.TS_NODE_PROJECT=root+'/backend/tsconfig.json';
process.env.DATABASE_URL='postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public';
process.env.PHARMACY_AGENT_CODEX_PATH=root+'/node_modules/.bin/codex';
process.env.JWT_SECRET='isolated-inventory-workflow-only';process.env.JWT_EXPIRES_IN='1d';process.env.NODE_ENV='development';
require(root+'/node_modules/ts-node/register/transpile-only');require('reflect-metadata');
const {Module,ValidationPipe}=require('@nestjs/common'),{NestFactory,APP_GUARD}=require('@nestjs/core'),{ConfigModule}=require('@nestjs/config');
const {AuthModule}=require(root+'/backend/src/modules/auth/auth.module'),{InventoryModule}=require(root+'/backend/src/modules/inventory/inventory.module'),{PharmacyModule}=require(root+'/backend/src/modules/pharmacy/pharmacy.module');
const {UsersModule}=require(root+'/backend/src/modules/users/users.module');
const {JwtAuthGuard}=require(root+'/backend/src/shared/guards/jwt-auth.guard'),{RolesGuard}=require(root+'/backend/src/shared/guards/roles.guard'),{PermissionsGuard}=require(root+'/backend/src/shared/guards/permissions.guard');
class StageModule{}Module({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true}),AuthModule,UsersModule,InventoryModule,PharmacyModule],providers:[{provide:APP_GUARD,useClass:JwtAuthGuard},{provide:APP_GUARD,useClass:RolesGuard},{provide:APP_GUARD,useClass:PermissionsGuard}]})(StageModule);
(async()=>{const {ExpressAdapter}=require(root+'/backend/node_modules/@nestjs/platform-express');const app=await NestFactory.create(StageModule,new ExpressAdapter(),{logger:['warn','error']});app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true}));await app.listen(4106,'127.0.0.1');console.log('Isolated inventory workflow API ready on 4106');for(const sig of ['SIGTERM','SIGINT'])process.on(sig,async()=>{await app.close();process.exit(0)})})().catch(e=>{console.error(e.message);process.exitCode=1});
