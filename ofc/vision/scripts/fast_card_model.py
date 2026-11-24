"""CardNetFast, copied from gigarepo servers/poker-os/scripts/learned_cards/fast_card_model.py (unchanged)."""
from torch import nn
class CardNetFast(nn.Module):
    """CPU-lean classifier, about 45 M MACs per 64x96 card crop."""
    def __init__(self, classes=53):
        super().__init__()
        def cbr(i, o, k=3, s=1, g=1):
            return [nn.Conv2d(i, o, k, s, k // 2, groups=g, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True)]
        self.f = nn.Sequential(*cbr(3, 24, 3, 2), *cbr(24, 24, 3, 1, 24), *cbr(24, 32, 1), nn.MaxPool2d(2),
                               *cbr(32, 64), *cbr(64, 64), nn.MaxPool2d(2), *cbr(64, 128), *cbr(128, 128),
                               nn.AdaptiveAvgPool2d((3, 2)))
        self.head = nn.Sequential(nn.Flatten(), nn.Dropout(0.2), nn.Linear(128 * 6, 128), nn.ReLU(inplace=True),
                                  nn.Linear(128, classes))
    def forward(self, x):
        return self.head(self.f(x - 0.5))
