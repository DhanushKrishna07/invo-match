import json

for fname in ['invo-match-manual-upload.n8n.json', 'invo-match-main.n8n.json', 'procurement-review-webhook.n8n.json']:
    print(f'Checking {fname}...')
    try:
        wf = json.load(open(f'workflows/{fname}', 'r', encoding='utf-8'))
        nodes = {n['name'] for n in wf.get('nodes', [])}
        connections = wf.get('connections', {})
        for source, targets in connections.items():
            if source not in nodes:
                print(f'  ERROR: Source node "{source}" in connections does not exist in nodes!')
            for conn_type, conn_lists in targets.items():
                for conn_list in conn_lists:
                    for target in conn_list:
                        tname = target.get('node')
                        if tname not in nodes:
                            print(f'  ERROR: Target node "{tname}" referenced by "{source}" does not exist in nodes!')
    except Exception as e:
        print(f'  Failed to check: {e}')
print('Done.')
