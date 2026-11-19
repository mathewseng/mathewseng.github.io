"""Classify the physical color of a die separately from its pips."""
import json

import cv2
import numpy as np


def color_features(patch):
    core = patch[10:22, 10:22]
    gray = cv2.cvtColor(core, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(core, cv2.COLOR_BGR2HSV)
    return np.r_[np.percentile(gray, [10, 25, 50, 75, 90]), np.percentile(hsv[:, :, 1], [25, 50, 75])] / 255


def legacy_color(patch):
    gray = cv2.cvtColor(patch[11:21, 11:21], cv2.COLOR_BGR2GRAY)
    return 'dark' if np.mean(gray < 122) > .22 else 'white'


class DiceBodyReader:
    def __init__(self, model):
        self.model = model
        self.weights = np.asarray(model['weights'])
        self.offset = model['offset']

    @classmethod
    def load(cls, file):
        return cls(json.loads(file.read_text()))

    def darkness(self, patch):
        logit = np.clip(color_features(patch) @ self.weights + self.offset, -40, 40)
        return float(1 / (1 + np.exp(-logit)))

    def predict(self, patch):
        return 'dark' if self.darkness(patch) >= .5 else 'white'
