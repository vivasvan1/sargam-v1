import json

def load_json(filename):
    with open(filename, 'r') as f:
        return json.load(f)

def clean_obj(obj):
    if isinstance(obj, list):
        return [clean_obj(x) for x in obj]
    if isinstance(obj, dict):
        # Remove nulls/nones to match TS omission
        return {k: clean_obj(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, float):
        # Convert to int if it's a whole number for easier comparison
        if obj.is_integer():
            return int(obj)
    return obj

def compare():
    py = load_json('python_results.json')
    ts = load_json('typescript_results.json')
    
    py_clean = clean_obj(py)
    ts_clean = clean_obj(ts)
    
    if py_clean == ts_clean:
        print("SUCCESS: Python and TypeScript parsers are identical!")
    else:
        print("FAILURE: Discrepancies found.")
        # Print first discrepancy
        for i, (p, t) in enumerate(zip(py_clean, ts_clean)):
            if p != t:
                print(f"Test case {i}:")
                print("Python:", json.dumps(p, indent=2))
                print("TypeScript:", json.dumps(t, indent=2))
                break

if __name__ == "__main__":
    compare()
