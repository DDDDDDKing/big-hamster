"""Build the public course index and export verified bank data separately."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('inputs', type=Path)
parser.add_argument('results', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('private_output', type=Path)
parser.add_argument('--verified', type=Path, required=True)
parser.add_argument('--publish', action='append', default=[], help='IDs already published in Supabase')
args = parser.parse_args()
verified = {(v['subject'],v['sourceName'],v['sourceRange']):set(v['sha256BySourceNumber'].values())
            for v in json.loads(args.verified.read_text()).values()}
types = {'single', 'multiple', 'boolean', 'short'}
source_groups = {
    path.relative_to(args.inputs).parts[:2]
    for path in args.inputs.glob('*/*') if path.is_file()
}
results = defaultdict(list)
for path in sorted(args.results.rglob('*.json')):
    result = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(result, dict) or not {'subject','sourceName','questions'}.issubset(result):
        continue
    key = (result['subject'], result['sourceName'])
    if key not in source_groups:
        raise ValueError(f'Unknown source in {path.name}')
    results[key].append(result)

def ident(*pieces):
    return hashlib.sha256(chr(31).join(pieces).encode()).hexdigest()[:24]

def nonempty(text):
    return isinstance(text,str) and bool(text.strip())

def validate(question):
    if question.get('status') != 'ready' or question.get('answerOrigin') != 'source':
        return False
    kind = question.get('type')
    if kind not in types or not nonempty(question.get('stem')) or not nonempty(question.get('explanation')):
        return False
    options, answer = question.get('options'), question.get('answer')
    if kind == 'short':
        return options == [] and answer == [] and nonempty(question.get('modelAnswer'))
    if not isinstance(options,list) or len(options) < 2 or not isinstance(answer,list) or not answer:
        return False
    if kind in {'single','boolean'} and len(answer) != 1:
        return False
    keys = set()
    correct = set()
    for option in options:
        key = option.get('key')
        if not nonempty(key) or key in keys or type(option.get('correct')) is not bool:
            return False
        if not nonempty(option.get('text')) or not nonempty(option.get('explanation')):
            return False
        keys.add(key)
        if option['correct']:
            correct.add(key)
    return len(set(answer)) == len(answer) and correct == set(answer)

groups = defaultdict(list)
payloads=[]
for subject, name in sorted(source_groups):
    bank_id = ident(subject, name)
    parts = sorted(results.get((subject,name), []), key=lambda part: part.get('part',1))
    questions = {}
    left = 0
    for part in parts:
        hashes = verified.get((subject,name,part.get('sourceRange')),set())
        for q in part['questions']:
            source_number = str(q.get('sourceNumber') or '')
            # Overlapping batches should retain one copy of exact source questions.
            fingerprint = ident(q.get('type',''), ' '.join(q.get('stem','').split()),
                                *[o.get('text','') for o in q.get('options') or []])
            if fingerprint in questions:
                continue
            check = hashlib.sha256(json.dumps(q,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            if check not in hashes or not validate(q):
                left += 1
                continue
            questions[fingerprint] = dict(q,id=fingerprint,sourceNumber=source_number)
    entry = dict(id=bank_id, name=Path(name).stem, sourceName=name, count=len(questions),
                 status='ready' if bank_id in args.publish and questions else 'review' if parts else 'processing', review=left)
    groups[subject].append(entry)
    if questions:
        payloads.append(dict(id=bank_id,subject=subject,sourceName=name,questions=list(questions.values())))

groups['药理学'].insert(0,dict(id='pharm-a',name='药理学 A 课程题库',count=1709,status='live',
    href='https://ddddddking.github.io/pharm-quiz/'))
args.output.write_text(json.dumps([dict(id=ident(subject), name=subject,banks=banks)
    for subject,banks in groups.items()],ensure_ascii=False,indent=2)+'\n')
args.private_output.write_text(json.dumps(payloads,ensure_ascii=False,indent=2)+'\n')
print(f'{len(groups)} subjects, {sum(map(len,groups.values()))} entries, {sum(len(b["questions"]) for b in payloads)} validated questions')
