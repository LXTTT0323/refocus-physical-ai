import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError


ROOT = Path(__file__).resolve().parents[1]


def load(relative_path):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


CASES = [
    (
        "product-skills/task-setup/references/task-contract.schema.json",
        "product-skills/task-setup/references/contract-example.json",
    ),
    (
        "product-skills/context-relevance/references/context-relevance.schema.json",
        "product-skills/context-relevance/references/contract-example.json",
    ),
    (
        "product-skills/session-summary/references/session-summary.schema.json",
        "product-skills/session-summary/references/contract-example.json",
    ),
]


class ProductSkillContractTests(unittest.TestCase):
    def test_examples_match_their_schemas(self):
        for schema_path, example_path in CASES:
            with self.subTest(example=example_path):
                Draft202012Validator(load(schema_path)).validate(load(example_path))

    def test_context_relevance_cannot_emit_hardware_commands(self):
        schema_path, example_path = CASES[1]
        output = load(example_path)
        output["led"] = "red_blink"
        with self.assertRaises(ValidationError):
            Draft202012Validator(load(schema_path)).validate(output)

    def test_session_summary_cannot_claim_unlisted_fields(self):
        schema_path, example_path = CASES[2]
        output = load(example_path)
        output["productivity_score"] = 99
        with self.assertRaises(ValidationError):
            Draft202012Validator(load(schema_path)).validate(output)


if __name__ == "__main__":
    unittest.main()
