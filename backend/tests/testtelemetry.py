import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telemetry.schemaparser import evaluate_metric_math, parse_satnogs_grafana_schema


class TestTelemetrySchemaParser(unittest.TestCase):
    def test_evaluate_metric_math_multiplication(self):
        val = 100.0
        res = evaluate_metric_math(val, " *0.0012207")
        self.assertAlmostEqual(res, 0.12207, places=5)

    def test_evaluate_metric_math_division(self):
        val = 1000.0
        res = evaluate_metric_math(val, " / 10")
        self.assertEqual(res, 100.0)

    def test_evaluate_metric_math_addition(self):
        val = 25.0
        res = evaluate_metric_math(val, " + 273.15")
        self.assertEqual(res, 298.15)

    def test_evaluate_metric_math_none_or_invalid(self):
        self.assertEqual(evaluate_metric_math(50.0, None), 50.0)
        self.assertEqual(evaluate_metric_math(50.0, ""), 50.0)

    def test_parse_satnogs_grafana_schema(self):
        sample_schema = {
            "dashboard": {
                "title": "AEPEX TT&C",
                "uid": "aepex_123",
                "panels": [
                    {
                        "id": 101,
                        "title": "AXIS Currents",
                        "type": "timeseries",
                        "targets": [
                            {
                                "refId": "A",
                                "alias": "AXIS 1 Current",
                                "select": [
                                    [
                                        {"type": "field", "params": ["sw_ana_axis1_curr"]},
                                        {"type": "mode", "params": []},
                                        {"type": "math", "params": [" *0.0012207"]}
                                    ]
                                ]
                            }
                        ]
                    }
                ]
            }
        }

        res = parse_satnogs_grafana_schema(sample_schema)
        self.assertEqual(res["title"], "AEPEX TT&C")
        self.assertEqual(res["panel_count"], 1)
        self.assertEqual(len(res["panels"]), 1)

        panel = res["panels"][0]
        self.assertEqual(panel["title"], "AXIS Currents")
        target = panel["targets"][0]
        self.assertEqual(target["alias"], "AXIS 1 Current")
        self.assertEqual(target["field_name"], "sw_ana_axis1_curr")
        self.assertEqual(target["math_expr"], " *0.0012207")


if __name__ == "__main__":
    unittest.main()
