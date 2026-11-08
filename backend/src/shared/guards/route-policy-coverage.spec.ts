import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const decorators = (node: ts.Node) => ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
const nameOf = (decorator: ts.Decorator) => {
  const expr = decorator.expression;
  const target = ts.isCallExpression(expr) ? expr.expression : expr;
  return ts.isIdentifier(target) ? target.text : '';
};
const hasPolicy = (node: ts.Node) => decorators(node).some(decorator => {
  const name = nameOf(decorator);
  if (['Roles', 'Permissions', 'Public', 'Authenticated'].includes(name)) return true;
  const expression = decorator.expression;
  return name === 'SetMetadata' && ts.isCallExpression(expression) &&
    expression.arguments[0] && ts.isStringLiteral(expression.arguments[0]) &&
    expression.arguments[0].text === 'isPublic' && expression.arguments[1]?.kind === ts.SyntaxKind.TrueKeyword;
});
function controllerFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? controllerFiles(full) : entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

it('requires an explicit public, authenticated, role or permission policy for every controller route', () => {
  const missing: string[] = [];
  for (const filename of controllerFiles(path.resolve(__dirname, '../..'))) {
    const file = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const node of file.statements) {
      if (!ts.isClassDeclaration(node) || !decorators(node).some(decorator => nameOf(decorator) === 'Controller')) continue;
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !decorators(member).some(decorator => ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head'].includes(nameOf(decorator)))) continue;
        if (!hasPolicy(member) && !hasPolicy(node)) missing.push(`${path.relative(process.cwd(), filename)}:${member.name.getText(file)}`);
      }
    }
  }
  expect(missing).toEqual([]);
});
