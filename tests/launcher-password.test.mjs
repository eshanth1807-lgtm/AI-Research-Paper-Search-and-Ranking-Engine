import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeCredential,verifyPassword} from '../scripts/launcher-password.mjs';
test('launcher passwords are salted and reject incorrect passwords',()=>{
  const a=makeCredential('test-only-password');const b=makeCredential('test-only-password');
  assert.notEqual(a.salt,b.salt);assert.notEqual(a.hash,b.hash);
  assert.equal(verifyPassword('test-only-password',a),true);
  assert.equal(verifyPassword('wrong-password',a),false);
  assert.ok(!JSON.stringify(a).includes('test-only-password'));
});
test('short passwords and corrupt credentials fail closed',()=>{
  assert.throws(()=>makeCredential('short'),/8 characters/);
  assert.throws(()=>verifyPassword('anything',{version:1,salt:'bad',hash:'bad'}),/Invalid/);
});
