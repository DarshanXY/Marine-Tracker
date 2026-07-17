"""Pytest bootstrap — put the flat package root on sys.path so tests can
`import satellite.fdi_calculator` etc. regardless of the invocation directory.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
