import os
import csv
import sys

def main():
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    base_dir = r"f:\extension HY"
    all_txt = os.path.join(base_dir, "all.txt")
    pass_txt = os.path.join(base_dir, "danh_sach_1585_ma_da_hoan_thanh_pass.txt")
    not_found_txt = os.path.join(base_dir, "danh_sach_15_ma_khong_tim_thay.txt")
    skipped_txt = os.path.join(base_dir, "danh_sach_1378_ma_loi_skipped.txt")
    csv_report = os.path.join(base_dir, "Bao_cao_xu_ly_quy_trinh_xoa_20260920_1823.csv")
    output_csv = os.path.join(base_dir, "Process_Checklist.csv")

    def read_lines(filepath):
        if not os.path.exists(filepath):
            return set()
        with open(filepath, "r", encoding="utf-8-sig", errors="ignore") as f:
            return set(line.strip() for line in f if line.strip())

    pass_set = read_lines(pass_txt)
    not_found_set = read_lines(not_found_txt)
    skipped_set = read_lines(skipped_txt)

    # Đọc chi tiết từ file CSV báo cáo trước đó (nếu có)
    csv_details = {}
    if os.path.exists(csv_report):
        with open(csv_report, "r", encoding="utf-8-sig", errors="ignore") as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            for row in reader:
                if len(row) >= 6:
                    code = row[1].strip()
                    scan_res = row[2].strip()
                    kept_item = row[3].strip()
                    note = row[4].strip()
                    time_str = row[5].strip()
                    csv_details[code] = {
                        "scan_res": scan_res,
                        "kept": kept_item,
                        "note": note,
                        "time": time_str
                    }

    # Đọc toàn bộ danh sách gốc theo thứ tự
    all_codes = []
    if os.path.exists(all_txt):
        with open(all_txt, "r", encoding="utf-8-sig", errors="ignore") as f:
            for line in f:
                c = line.strip()
                if c and c not in all_codes:
                    all_codes.append(c)

    headers = [
        "STT",
        "Mã hồ sơ",
        "Nhóm trạng thái",
        "Chi tiết trạng thái",
        "Số bản ghi",
        "Kiểm chứng 10%",
        "Bản ghi giữ lại / Tiêu đề",
        "Thời gian cập nhật"
    ]

    count_completed = 0
    count_rescan = 0
    count_locked = 0
    count_pending = 0

    rows = []
    for idx, code in enumerate(all_codes, start=1):
        detail = csv_details.get(code, {})
        kept = detail.get("kept", "-")
        time_val = detail.get("time", "-")

        if code in pass_set:
            status_group = "HOÀN THÀNH"
            detail_status = "Độc nhất chuẩn (1 bản duy nhất)"
            record_count = "1"
            count_completed += 1
        elif code in not_found_set:
            status_group = "CẦN SCAN LẠI"
            detail_status = "Không tìm thấy hồ sơ (Nghi ngờ timeout/cần xác thực lại)"
            record_count = "0"
            count_rescan += 1
        elif code in skipped_set:
            status_group = "LỖI KHÓA"
            detail_status = "Bỏ qua: Lỗi máy chủ khóa bản ghi không cho xóa"
            record_count = ">1"
            count_locked += 1
        else:
            status_group = "CHƯA CHẠY"
            detail_status = "Chưa xử lý (Còn trong hàng đợi)"
            record_count = "-"
            count_pending += 1

        spot_check = "Chưa kiểm chứng"

        rows.append([
            idx,
            code,
            status_group,
            detail_status,
            record_count,
            spot_check,
            kept,
            time_val
        ])

    # Xuất ra file CSV với BOM UTF-8
    with open(output_csv, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

    # Xuất ra file JSON seed để Extension nạp ngay khi khởi động
    output_json = os.path.join(base_dir, "process_checklist_seed.json")
    import json
    checklist_dict = {}
    for r in rows:
        c_idx, c_code, c_grp, c_det, c_cnt, c_spot, c_kept, c_time = r
        checklist_dict[c_code] = {
            "code": c_code,
            "statusGroup": c_grp,
            "detailStatus": c_det,
            "recordCount": c_cnt,
            "spotChecked": False,
            "kept": c_kept,
            "time": c_time
        }
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(checklist_dict, f, ensure_ascii=False, indent=2)

    print(f"✅ ĐÃ XUẤT THÀNH CÔNG CSV : {output_csv}")
    print(f"✅ ĐÃ XUẤT THÀNH CÔNG JSON: {output_json}")
    print(f"Tổng số mã trong checklist: {len(rows)}")
    print(f"- HOÀN THÀNH : {count_completed} mã")
    print(f"- CẦN SCAN LẠI: {count_rescan} mã")
    print(f"- LỖI KHÓA    : {count_locked} mã")
    print(f"- CHƯA CHẠY   : {count_pending} mã")

if __name__ == "__main__":
    main()
