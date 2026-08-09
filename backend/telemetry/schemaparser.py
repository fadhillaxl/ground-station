# Parser and formula evaluator for SatNOGS Grafana dashboard schemas.

import logging
import re
from typing import Dict, Any, List, Optional

logger = logging.getLogger("telemetry-schemaparser")


def evaluate_metric_math(raw_value: float, math_expr: Optional[str]) -> float:
    """
    Safely applies mathematical scaling operations (e.g. " *0.0012207", " / 1000", " + 273.15").
    """
    if not math_expr or not isinstance(math_expr, str):
        return raw_value

    expr = math_expr.strip()
    if not expr:
        return raw_value

    try:
        # Match multiplication: "* 0.0012207" or "*0.001"
        m_mult = re.match(r"^\*\s*([0-9eE\.\-]+)$", expr)
        if m_mult:
            return raw_value * float(m_mult.group(1))

        # Match division: "/ 1000"
        m_div = re.match(r"^\/\s*([0-9eE\.\-]+)$", expr)
        if m_div:
            divisor = float(m_div.group(1))
            return raw_value / divisor if divisor != 0 else raw_value

        # Match addition: "+ 273.15"
        m_add = re.match(r"^\+\s*([0-9eE\.\-]+)$", expr)
        if m_add:
            return raw_value + float(m_add.group(1))

        # Match subtraction: "- 50"
        m_sub = re.match(r"^\-\s*([0-9eE\.\-]+)$", expr)
        if m_sub:
            return raw_value - float(m_sub.group(1))

    except Exception as e:
        logger.warning(f"Failed to evaluate math expression '{math_expr}' on value {raw_value}: {e}")

    return raw_value


def parse_satnogs_grafana_schema(dashboard_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses SatNOGS Grafana dashboard schema JSON into normalized panels and targets.
    """
    dashboard = dashboard_json.get("dashboard", dashboard_json)
    title = dashboard.get("title", "SatNOGS Telemetry Dashboard")
    uid = dashboard.get("uid", "")
    panels = dashboard.get("panels", [])

    parsed_panels: List[Dict[str, Any]] = []

    for panel in panels:
        panel_id = panel.get("id")
        panel_title = panel.get("title", "Metric Panel")
        panel_type = panel.get("type", "timeseries")
        targets = panel.get("targets", [])

        parsed_targets: List[Dict[str, Any]] = []

        for tgt in targets:
            alias = tgt.get("alias", "")
            select_chains = tgt.get("select", [])

            field_name = ""
            math_expr = ""

            for chain in select_chains:
                for elem in chain:
                    elem_type = elem.get("type")
                    params = elem.get("params", [])

                    if elem_type == "field" and params:
                        field_name = params[0]
                    elif elem_type == "math" and params:
                        math_expr = params[0]

            if field_name:
                parsed_targets.append({
                    "refId": tgt.get("refId", "A"),
                    "alias": alias or field_name,
                    "field_name": field_name,
                    "math_expr": math_expr,
                })

        if parsed_targets:
            parsed_panels.append({
                "id": panel_id,
                "title": panel_title,
                "type": panel_type,
                "targets": parsed_targets,
            })

    return {
        "title": title,
        "uid": uid,
        "panel_count": len(parsed_panels),
        "panels": parsed_panels,
    }
