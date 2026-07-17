"""Higher-level analysis over the base pipeline.

  * change_detection — compare an AOI across two time windows (growing / new?)
  * calibration      — turn raw softmax confidence into an honest reliability
                       estimate using the model's held-out per-class precision
"""
