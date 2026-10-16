import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import duo_killer
from protocol import Channel
from service import Service


def review_model(total="RMB 10"):
    item = {
        "d": {"sku": "MK2U4CH/A", "name": "测试商品", "totalPrice": "RMB 10"},
        "itemQuantity": {"d": {"quantity": 1}},
    }
    return {
        "checkout": {
            "review": {
                "fulfillmentReview": {"items": {"item-1": item}},
                "summary": {"d": {"total": total}},
            },
            "companionBar": {"orderDetails": {}},
        }
    }


class ScheduledPurchaseTests(unittest.TestCase):
    def test_auto_confirmation_checks_items_and_amount_without_prompt(self):
        handler = Mock()
        with patch.object(duo_killer.interaction, "handler", handler):
            duo_killer.confirm_order(
                review_model(),
                auto_confirm=True,
                max_total="20",
                expected_items=[("MK2U4CH/A", 1)],
            )
        handler.confirm.assert_not_called()

    def test_auto_confirmation_stops_when_amount_exceeds_limit(self):
        with self.assertRaisesRegex(ValueError, "最高限额"):
            duo_killer.confirm_order(
                review_model("RMB 21"),
                auto_confirm=True,
                max_total="20",
                expected_items=[("MK2U4CH/A", 1)],
            )

    def test_retryable_error_requires_no_remote_side_effect(self):
        with tempfile.TemporaryDirectory() as directory:
            service = Service(
                Channel("a", "t", io.StringIO()),
                Path(directory),
                Path(directory),
                "a@example.test",
                Mock(),
            )
            service.action = "purchase"
            self.assertTrue(service.retryable(ValueError("未开放")))
            service.side_effect = "unknown"
            self.assertFalse(service.retryable(ValueError("请求失败")))
            service.side_effect = "none"
            service.submitted = True
            self.assertFalse(service.retryable(ValueError("请求失败")))


if __name__ == "__main__":
    unittest.main()
