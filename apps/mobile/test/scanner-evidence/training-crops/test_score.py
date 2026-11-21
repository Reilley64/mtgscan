# /// script
# requires-python = ">=3.11"
# ///
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).parent
FIXTURE = HERE / "fixture-421"
TOLERANCE_MM = 0.3

ISSUE_421_TABLE = {
    "c39d7c2c-9eec-41b1-87f7-e3245d98aa88": (-0.4, -0.2, -0.4, +0.3),
    "3726fd7e-eda7-4564-abab-b769d434aa3d": (-0.1, -0.3, -0.8, +0.8),
    "66e0c6fa-c8c8-4aea-a2a2-3c414235e795": (+3.7, +5.4, +0.4, -0.0),
    "1176e6f4-a976-4f08-a007-23f3842b72d2": (+0.7, +1.0, -0.0, +0.4),
    "4ab0e0aa-00cc-4d66-9760-767723a1372e": (+0.3, +0.7, -0.6, +0.5),
    "9adb821e-12f4-41fe-81fd-a1606e273004": (-0.1, -0.0, -0.1, +0.2),
    "2ed769ab-6b4f-4f89-8513-70cf151483f1": (-0.6, -2.0, +0.7, -0.8),
    "f18996e6-879f-4aea-99f8-fc71d9d91068": (-2.2, -3.9, -0.3, +1.2),
    "0362c6a3-49a0-4ac0-9453-1292bd32556e": (+0.0, -1.0, -0.2, -4.8),
    "67a42538-13c1-4ad4-b42d-984aebb0d096": (+0.1, +0.3, -0.2, +0.2),
}

INSIDE_OUTLINES_IN_421 = {
    "66e0c6fa-c8c8-4aea-a2a2-3c414235e795",
    "1176e6f4-a976-4f08-a007-23f3842b72d2",
    "4ab0e0aa-00cc-4d66-9760-767723a1372e",
    "0362c6a3-49a0-4ac0-9453-1292bd32556e",
}

TRIAL_CROPS = list(ISSUE_421_TABLE)[:5]


def score(folder, output):
    subprocess.run(
        ["uv", "run", "--quiet", str(HERE / "score.py"), str(folder), "--images", str(FIXTURE / "references"), "--output", str(output)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    return json.loads(output.read_text())


def crop_id(row):
    return Path(row["crop"]).stem


class TrainingCropScorer(unittest.TestCase):
    def setUp(self):
        self.work = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.work)

    def copy_of_fixture(self):
        folder = self.work / "crops-pull"
        shutil.copytree(FIXTURE, folder, ignore=shutil.ignore_patterns("references"))
        return folder

    def test_it_reproduces_the_421_table_within_0_3_mm(self):
        scores = score(FIXTURE, self.work / "scores.json")
        rows = {crop_id(row): row for row in scores["crops"]}
        self.assertEqual(set(rows), set(ISSUE_421_TABLE))
        for crop, expected in ISSUE_421_TABLE.items():
            row = rows[crop]
            measured = (row["sizeMm"]["width"], row["sizeMm"]["height"], row["shiftMm"]["horizontal"], row["shiftMm"]["vertical"])
            for name, value, want in zip(("size width", "size height", "shift horizontal", "shift vertical"), measured, expected):
                self.assertAlmostEqual(value, want, delta=TOLERANCE_MM, msg=f"{crop} {name}")

    def test_it_marks_every_inside_outline_of_the_421_table(self):
        scores = score(FIXTURE, self.work / "scores.json")
        self.assertEqual({crop_id(row) for row in scores["crops"] if row["scored"] and row["inside"]}, INSIDE_OUTLINES_IN_421)

    def test_a_crop_below_the_correlation_floor_is_unscored(self):
        folder = self.copy_of_fixture()
        labels = json.loads((folder / "labels.json").read_text())
        doctor_doom = next(card for card in labels["cards"] if card["crop"] == "crops/3726fd7e-eda7-4564-abab-b769d434aa3d.jpg")
        doctor_doom["scryfallId"] = "f3869752-eade-4e7a-8dd1-68cafb9e10be"
        (folder / "labels.json").write_text(json.dumps(labels))
        rows = {crop_id(row): row for row in score(folder, self.work / "scores.json")["crops"]}
        unscored = rows["3726fd7e-eda7-4564-abab-b769d434aa3d"]
        self.assertFalse(unscored["scored"])
        self.assertNotIn("sizeMm", unscored)
        self.assertNotIn("shiftMm", unscored)
        self.assertNotIn("inside", unscored)

    def test_totals_are_split_by_app_build(self):
        folder = self.copy_of_fixture()
        evidence = json.loads((folder / "evidence.json").read_text())
        for record in evidence:
            record["recognizer_version"] = "0.1.0 (7)" if record["crop_id"] in TRIAL_CROPS else "0.1.0 (8)"
        (folder / "evidence.json").write_text(json.dumps(evidence))
        builds = {build["appBuild"]: build for build in score(folder, self.work / "scores.json")["builds"]}
        self.assertEqual(
            builds,
            {
                "0.1.0 (7)": {"appBuild": "0.1.0 (7)", "crops": 5, "scored": 5, "unscored": 0, "insideOutlines": 3},
                "0.1.0 (8)": {"appBuild": "0.1.0 (8)", "crops": 5, "scored": 5, "unscored": 0, "insideOutlines": 1},
            },
        )


if __name__ == "__main__":
    unittest.main()
